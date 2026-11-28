import { requireViewObject, requireViewRelationship } from './viewpoints.js';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type {
  Changeset,
  ChangesetResult,
  DemoIdentity,
  ModelOperation,
} from '@archimesh/contracts';
import {
  ConceptError,
  parseConcept,
  remapConceptIds,
  validateRelationship,
  withViewPositions,
  type ParsedConcept,
} from '@archimesh/core';
import {
  canWrite,
  conflict,
  invalid,
  loadDocument,
  missing,
  useIdentity,
  type ConceptData,
  type Db,
  type Projection,
  type Tx,
} from './store.js';

interface PendingDocument {
  scopeId: string;
  concept: ParsedConcept;
  markdown: string;
  retired: boolean;
  previousRevision?: string;
}

type Target = Pick<PendingDocument, 'scopeId' | 'retired'> & {
  concept: Pick<ConceptData, 'type' | 'lifecycle' | 'relationship'>;
};

function parse(markdown: string) {
  try {
    return parseConcept(markdown);
  } catch (error) {
    if (error instanceof ConceptError) throw invalid(error.message);
    throw error;
  }
}

function contractorCreateIds(
  actor: DemoIdentity,
  operations: ModelOperation[],
) {
  const ids = new Map<string, string>();
  for (const operation of operations) {
    if (operation.kind === 'create') {
      const { id } = parse(operation.markdown);
      if (ids.has(id)) throw invalid('A changeset must name each object once');
      ids.set(id, actor === 'architect' ? id : randomUUID());
    }
  }
  return ids;
}

async function prepare(
  tx: Tx,
  actor: DemoIdentity,
  operations: ModelOperation[],
): Promise<Map<string, PendingDocument>> {
  const ids = contractorCreateIds(actor, operations);
  const result = new Map<string, PendingDocument>();
  for (const operation of operations) {
    if (operation.kind !== 'retire' && operation.markdown.includes('\0')) {
      throw invalid('Markdown must not contain NUL characters');
    }

    const starting =
      operation.kind === 'create'
        ? undefined
        : await loadDocument(tx, operation.id);
    const scopeId =
      operation.kind === 'create' ? operation.scopeId : starting?.scope_id;
    if (!scopeId || !(await canWrite(tx, scopeId))) throw missing();
    if (
      operation.kind !== 'create' &&
      (starting?.revision_id !== operation.expectedRevisionId ||
        starting.retired)
    ) {
      throw conflict();
    }

    const source =
      operation.kind === 'retire' ? starting?.markdown : operation.markdown;
    if (!source) throw missing();
    const markdown =
      ids.size && actor !== 'architect' && operation.kind !== 'retire'
        ? remapConceptIds(source, ids)
        : source;
    const concept = parse(markdown);
    if (
      starting &&
      (starting.id !== concept.id || starting.data.type !== concept.type)
    ) {
      throw invalid('Object identity and type are fixed across revisions');
    }
    if (result.has(concept.id))
      throw invalid('A changeset must name each object once');
    result.set(concept.id, {
      scopeId,
      concept,
      markdown,
      retired: operation.kind === 'retire',
      ...(starting ? { previousRevision: starting.revision_id } : {}),
    });
  }
  return result;
}

function requireReference(
  targets: ReadonlyMap<string, Target>,
  id: string,
  scope: string,
) {
  const target = targets.get(id);
  if (
    !target ||
    target.retired ||
    (target.scopeId !== scope && target.scopeId !== 'shared')
  ) {
    throw invalid('A typed reference does not resolve in this scope');
  }
  return target.concept;
}

async function validateGraph(
  tx: Tx,
  pending: ReadonlyMap<string, PendingDocument>,
) {
  const referenced = new Set<string>();
  const instances = new Set<string>();
  const touched = [...pending.keys()];
  const retired = [];
  const editedEdges: string[] = [];
  for (const [
    id,
    { concept, retired: tombstone, previousRevision },
  ] of pending) {
    if (concept.type === 'application-instance' && !tombstone)
      instances.add(id);
    if (tombstone) retired.push(id);
    if (concept.relationship) {
      if (previousRevision && !tombstone) editedEdges.push(id);
      referenced.add(concept.relationship.sourceId);
      referenced.add(concept.relationship.targetId);
      if (concept.relationship.type === 'instance-of')
        instances.add(concept.relationship.sourceId);
    }
    if (concept.view) {
      for (const member of [
        ...concept.view.objectIds,
        ...concept.view.relationshipIds,
      ]) {
        referenced.add(member);
      }
    }
  }

  const oldLinks = await sql<{ source_id: string }>`
    SELECT source_id FROM model_objects
    WHERE id = ANY(${touched}::uuid[]) AND data #>> '{relationship,type}' = 'instance-of'
  `.execute(tx);
  for (const link of oldLinks.rows) instances.add(link.source_id);

  const targets = new Map<string, Target>(pending);
  const ids = [...new Set([...referenced, ...instances])].filter(
    (id) => !targets.has(id),
  );
  if (ids.length) {
    const result = await sql<Projection>`
      SELECT id, scope_id, revision_id, updated_at, retired, data
      FROM model_objects WHERE id = ANY(${ids}::uuid[])
    `.execute(tx);
    for (const row of result.rows) {
      targets.set(row.id, {
        scopeId: row.scope_id,
        retired: row.retired,
        concept: row.data,
      });
    }
  }

  for (const [id, item] of pending) {
    if (item.retired) continue;
    const { relationship, view } = item.concept;
    if (relationship) {
      const { type, sourceId, targetId } = relationship;
      if (sourceId === targetId || sourceId === id || targetId === id) {
        throw invalid('A relationship must connect two distinct objects');
      }
      const source = requireReference(targets, sourceId, item.scopeId);
      const target = requireReference(targets, targetId, item.scopeId);
      try {
        validateRelationship(type, source.type, target.type);
      } catch (error) {
        if (error instanceof ConceptError) throw invalid(error.message);
        throw error;
      }
      if (
        type === 'instance-of' &&
        targets.get(sourceId)?.scopeId !== item.scopeId
      ) {
        throw invalid('Instance-of must be managed in the instance scope');
      }
    }
    if (view) {
      for (const member of view.objectIds) {
        requireViewObject(
          view,
          requireReference(targets, member, item.scopeId).type,
        );
      }
      for (const edge of view.relationshipIds) {
        requireViewRelationship(
          view,
          requireReference(targets, edge, item.scopeId).relationship,
        );
      }
    }
  }

  if (editedEdges.length) {
    const savedViews = await sql<{ view: NonNullable<ConceptData['view']> }>`
      SELECT data->'view' AS view FROM model_objects
      WHERE NOT retired AND NOT id = ANY(${touched}::uuid[])
        AND data #> '{view,relationshipIds}' ?| ${editedEdges}::text[]
    `.execute(tx);
    for (const { view } of savedViews.rows) {
      for (const edge of view.relationshipIds) {
        const item = pending.get(edge);
        if (item) requireViewRelationship(view, item.concept.relationship);
      }
    }
  }

  const activeInstances = [...instances].filter((id) => {
    const item = targets.get(id);
    return (
      item &&
      !item.retired &&
      item.concept.type === 'application-instance' &&
      item.concept.lifecycle === 'active'
    );
  });
  if (activeInstances.length) {
    const stored = await sql<{ source_id: string; count: number }>`
      SELECT source_id, count(*)::integer AS count FROM model_objects
      WHERE source_id = ANY(${activeInstances}::uuid[]) AND NOT retired
        AND NOT id = ANY(${touched}::uuid[]) AND data #>> '{relationship,type}' = 'instance-of'
      GROUP BY source_id
    `.execute(tx);
    const counts = new Map(
      stored.rows.map((row) => [row.source_id, row.count]),
    );
    for (const item of pending.values()) {
      const link = item.retired ? null : item.concept.relationship;
      if (link?.type === 'instance-of') {
        counts.set(link.sourceId, (counts.get(link.sourceId) ?? 0) + 1);
      }
    }
    if (activeInstances.some((id) => counts.get(id) !== 1)) {
      throw invalid(
        'Each active application instance requires exactly one instance-of relationship',
      );
    }
  }

  if (retired.length) {
    const result = await sql`
      SELECT id FROM model_objects WHERE NOT retired AND NOT id = ANY(${touched}::uuid[])
        AND (
          source_id = ANY(${retired}::uuid[]) OR target_id = ANY(${retired}::uuid[])
          OR data #> '{view,objectIds}' ?| ${retired}::text[]
          OR data #> '{view,relationshipIds}' ?| ${retired}::text[]
        ) LIMIT 1
    `.execute(tx);
    if (result.rows.length)
      throw invalid(
        'Remove live relationships and view references before retirement',
      );
  }
}

async function executeChange(
  tx: Tx,
  actor: DemoIdentity,
  input: Changeset,
  options: { validateOnly?: boolean } = {},
): Promise<ChangesetResult | undefined> {
  const hash = createHash('sha256')
    .update(JSON.stringify(input.operations))
    .digest('hex');
  if (!options.validateOnly) {
    const prior = await sql<{ request_hash: string; result: ChangesetResult }>`
      SELECT request_hash, result FROM model_commits
      WHERE actor = ${actor} AND request_id = ${input.requestId}::uuid
    `.execute(tx);
    const receipt = prior.rows[0];
    if (receipt) {
      if (receipt.request_hash !== hash) throw conflict();
      for (const object of receipt.result.objects) {
        const document = await loadDocument(tx, object.id);
        if (!(await canWrite(tx, document.scope_id))) throw missing();
      }
      return receipt.result;
    }
  }

  const pending = await prepare(tx, actor, input.operations);
  await validateGraph(tx, pending);
  if (options.validateOnly) return undefined;

  const commitId = randomUUID();
  const result: ChangesetResult = {
    commitId,
    objects: [...pending.keys()].map((id) => ({
      id,
      revisionId: randomUUID(),
    })),
  };
  const now = new Date();
  const commit = await sql<{ sequence: string }>`
    INSERT INTO model_commits (id, actor, request_id, request_hash, recorded_at, result)
    VALUES (
      ${commitId}, ${actor}, ${input.requestId}, ${hash}, ${now}, ${JSON.stringify(result)}::jsonb
    )
    RETURNING sequence
  `.execute(tx);
  const sequence = commit.rows[0]?.sequence;
  if (!sequence) throw new Error('Commit sequence unavailable');

  for (const { id, revisionId } of result.objects) {
    const item = pending.get(id);
    if (!item) throw new Error('Changeset plan incomplete');
    const { concept, scopeId, retired, markdown } = item;
    const {
      title,
      type,
      description,
      aliases,
      lifecycle,
      owner,
      relationship,
      body,
      attributes,
      view,
    } = concept;
    const data: ConceptData = {
      type,
      title,
      description,
      aliases,
      lifecycle,
      owner,
      relationship,
      body,
      attributes,
      view,
    };
    const json = JSON.stringify(data);
    const searchText = [title, description, body, ...aliases].join(' ');
    const values = sql`
      ${id}, ${scopeId}, ${type}, ${title}, ${description}, ${searchText}, ${json}::jsonb,
      ${relationship?.sourceId ?? null}, ${relationship?.targetId ?? null},
      ${revisionId}, ${now}, ${retired}
    `;
    const created = await sql`
      INSERT INTO model_revisions (
        id, object_id, scope_id, commit_id, commit_sequence, recorded_at, actor,
        markdown, data, effective_from, effective_to, retired
      ) VALUES (
        ${revisionId}, ${id}, ${scopeId}, ${commitId}, ${sequence}, ${now}, ${actor},
        ${markdown}, ${json}::jsonb,
        ${retired ? now.toISOString().slice(0, 10) : concept.effectiveFrom},
        ${retired ? null : concept.effectiveTo}, ${retired}
      )
    `.execute(tx);
    if (created.numAffectedRows !== 1n)
      throw new Error('Revision insert failed');
    if (item.previousRevision) {
      const updated = await sql`
        UPDATE model_objects SET title = ${title}, description = ${description},
          search_text = ${searchText}, data = ${json}::jsonb,
          source_id = ${relationship?.sourceId ?? null}, target_id = ${relationship?.targetId ?? null},
          revision_id = ${revisionId}, updated_at = ${now}, retired = ${retired}
        WHERE id = ${id} AND revision_id = ${item.previousRevision}
      `.execute(tx);
      if (updated.numAffectedRows !== 1n) throw conflict();
    } else {
      await sql`
        INSERT INTO model_objects (
          id, scope_id, type, title, description, search_text, data,
          source_id, target_id, revision_id, updated_at, retired
        ) VALUES (${values})
      `.execute(tx);
    }
  }

  return result;
}

export function modelWrite<T>(
  db: Db,
  actor: DemoIdentity,
  action: (tx: Tx) => Promise<T>,
) {
  return db.transaction().execute(async (tx) => {
    await useIdentity(tx, actor);
    await sql`SELECT pg_advisory_xact_lock(453912770, 1)`.execute(tx);
    return action(tx);
  });
}

export async function commitChangeset(
  db: Db,
  actor: DemoIdentity,
  input: Changeset,
) {
  return modelWrite(db, actor, async (tx) => {
    const result = await executeChange(tx, actor, input);
    if (!result) throw new Error('No changeset committed');
    return result;
  });
}

export async function validateChangeset(
  db: Db,
  actor: DemoIdentity,
  input: Changeset,
) {
  await modelWrite(db, actor, (tx) =>
    executeChange(tx, actor, input, { validateOnly: true }),
  );
}

export async function saveLayout(
  db: Db,
  actor: DemoIdentity,
  id: string,
  expectedRevisionId: string,
  requestId: string,
  positions: NonNullable<ParsedConcept['view']>['positions'],
) {
  return modelWrite(db, actor, async (tx) => {
    const prior = await loadDocument(tx, id, expectedRevisionId);
    if (!prior.data.view) throw missing();
    let markdown: string;
    try {
      markdown = withViewPositions(prior.markdown, positions);
    } catch (error) {
      if (error instanceof ConceptError) throw invalid(error.message);
      throw error;
    }
    const result = await executeChange(tx, actor, {
      requestId,
      operations: [{ kind: 'update', id, expectedRevisionId, markdown }],
    });
    if (!result) throw new Error('No layout committed');
    return result;
  });
}

export async function prepareProposal(
  tx: Tx,
  actor: DemoIdentity,
  operations: ModelOperation[],
) {
  const pending = await prepare(tx, actor, operations);
  await validateGraph(tx, pending);
  return pending;
}
