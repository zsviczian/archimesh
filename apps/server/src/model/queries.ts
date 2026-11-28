import { sql } from 'kysely';
import type {
  DemoIdentity,
  ModelRevision,
  ModelSession,
  Neighborhood,
  ObjectList,
} from '@archimesh/contracts';
import { z } from 'zod';
import {
  detail,
  loadDocument,
  missing,
  readModel,
  summary,
  type Db,
  type Projection,
  type Tx,
} from './store.js';

export const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.string().max(64).optional(),
  scopeId: z.string().max(64).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  recordedAt: z.iso.datetime().optional(),
  effectiveOn: z.iso.date().optional(),
});
type ListFilter = z.infer<typeof listQuery>;

export function getSession(db: Db, actor: DemoIdentity): Promise<ModelSession> {
  return readModel(db, actor, async (tx) => {
    const result = await sql<ModelSession['scopes'][number]>`
      SELECT s.id, s.label, g.can_write AS writable
      FROM model_scopes s JOIN model_scope_grants g ON g.scope_id = s.id
      ORDER BY (s.id <> 'shared'), s.label
    `.execute(tx);
    return { identity: actor, scopes: result.rows };
  });
}

function listSource(filter: ListFilter) {
  if (!filter.recordedAt && !filter.effectiveOn) {
    return sql`SELECT * FROM model_objects`;
  }
  return sql`
    SELECT id, scope_id, revision_id, updated_at, retired, data,
      data->>'type' AS type, data->>'title' AS title,
      to_tsvector('simple'::regconfig, concat_ws(' ', data->>'title', data->>'description',
        data->>'body', data->>'aliases')) AS search_vector
    FROM (
      SELECT DISTINCT ON (r.object_id) r.object_id AS id, r.scope_id, r.id AS revision_id,
        r.recorded_at AS updated_at, r.retired, r.data
      FROM model_revisions r
      WHERE ${filter.recordedAt ? sql`r.recorded_at <= ${filter.recordedAt}::timestamptz` : sql`true`}
        AND ${
          filter.effectiveOn
            ? sql`
          r.effective_from <= ${filter.effectiveOn}::date
          AND (r.effective_to IS NULL OR ${filter.effectiveOn}::date < r.effective_to)
        `
            : sql`true`
        }
      ORDER BY r.object_id, r.commit_sequence DESC
    ) versioned
  `;
}

export async function listInTransaction(
  tx: Tx,
  filter: ListFilter,
): Promise<ObjectList> {
  const criteria = [sql`NOT visible.retired`];
  if (filter.q) {
    criteria.push(sql`(
      visible.search_vector @@ websearch_to_tsquery('simple', ${filter.q})
      OR position(lower(${filter.q}) in lower(visible.title)) > 0
    )`);
  }
  if (filter.type) criteria.push(sql`visible.type = ${filter.type}`);
  if (filter.scopeId) criteria.push(sql`visible.scope_id = ${filter.scopeId}`);
  if (filter.cursor) {
    criteria.push(sql`(lower(visible.title), visible.id) > (
      (SELECT lower(title) FROM visible WHERE id = ${filter.cursor}::uuid),
      ${filter.cursor}::uuid
    )`);
  }

  const rows = await sql<Projection>`
    WITH visible AS NOT MATERIALIZED (${listSource(filter)})
    SELECT visible.id, visible.scope_id, visible.revision_id, visible.updated_at,
      visible.retired, visible.data
    FROM visible WHERE ${sql.join(criteria, sql` AND `)}
    ORDER BY lower(visible.title), visible.id
    LIMIT ${filter.limit + 1}
  `.execute(tx);
  const items = rows.rows.slice(0, filter.limit).map(summary);
  return {
    items,
    nextCursor:
      rows.rows.length > filter.limit ? (items.at(-1)?.id ?? null) : null,
  };
}

export function listObjects(db: Db, actor: DemoIdentity, filter: ListFilter) {
  return readModel(db, actor, (tx) => listInTransaction(tx, filter));
}

export function getObject(
  db: Db,
  actor: DemoIdentity,
  id: string,
  revision?: string,
) {
  return readModel(db, actor, async (tx) =>
    detail(await loadDocument(tx, id, revision)),
  );
}

export function getHistory(db: Db, actor: DemoIdentity, id: string) {
  return readModel(db, actor, async (tx) => {
    await loadDocument(tx, id);
    const result = await sql<
      Omit<ModelRevision, 'recordedAt'> & { recordedAt: Date }
    >`
      SELECT id, commit_id AS "commitId", actor, recorded_at AS "recordedAt",
        to_char(effective_from, 'YYYY-MM-DD') AS "effectiveFrom",
        to_char(effective_to, 'YYYY-MM-DD') AS "effectiveTo", retired
      FROM model_revisions WHERE object_id = ${id}::uuid
      ORDER BY commit_sequence DESC LIMIT 100
    `.execute(tx);
    return {
      items: result.rows.map((row) => ({
        ...row,
        recordedAt: row.recordedAt.toISOString(),
      })),
    };
  });
}

export function getNeighborhood(
  db: Db,
  actor: DemoIdentity,
  id: string,
  direction: 'inbound' | 'outbound' | 'both' = 'both',
): Promise<Neighborhood> {
  return readModel(db, actor, async (tx) => {
    const focus = await loadDocument(tx, id);
    const adjacent = [sql`id = ${id}::uuid`];
    if (direction !== 'inbound') adjacent.push(sql`source_id = ${id}::uuid`);
    if (direction !== 'outbound') adjacent.push(sql`target_id = ${id}::uuid`);
    const result = await sql<Projection>`
      SELECT id, scope_id, revision_id, updated_at, retired, data
      FROM model_objects
      WHERE NOT retired AND type = 'relationship' AND (${sql.join(adjacent, sql` OR `)})
      ORDER BY lower(title), id
      LIMIT 41
    `.execute(tx);
    const edges = result.rows.slice(0, 40).map(summary);
    const nodeIds = new Set([id]);
    for (const edge of edges) {
      if (edge.relationship) {
        nodeIds.add(edge.relationship.sourceId);
        nodeIds.add(edge.relationship.targetId);
      }
    }

    const nodes = await sql<Projection>`
      SELECT id, scope_id, revision_id, updated_at, retired, data
      FROM model_objects WHERE id = ANY(${[...nodeIds]}::uuid[])
      ORDER BY lower(title), id
    `.execute(tx);
    if (!nodes.rows.some((node) => node.id === focus.id)) throw missing();
    const returned = new Set(nodes.rows.map((node) => node.id));
    return {
      nodes: nodes.rows.map(summary),
      edges: edges.filter(
        (edge) =>
          edge.relationship &&
          returned.has(edge.relationship.sourceId) &&
          returned.has(edge.relationship.targetId),
      ),
      partial: result.rows.length > 40,
    };
  });
}
