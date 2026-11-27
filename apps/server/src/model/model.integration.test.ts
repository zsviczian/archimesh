import { randomUUID } from 'node:crypto';
import {
  bundleSchema,
  changesetResultSchema,
  identityHeader,
  modelObjectSchema,
  modelSummarySchema,
  neighborhoodSchema,
  objectListSchema,
  revisionSchema,
  sessionSchema,
  type DemoIdentity,
  type ModelOperation,
} from '@archimesh/contracts';
import { okfVersion, serializeConcept } from '@archimesh/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../app.js';
import { checkDatabase, createDatabase } from '../db.js';
import { demoIds } from '../demo-bundle.js';
import { loadProjectEnv, testDatabaseUrls } from '../env.js';
import { type Db } from './store.js';

const architect = 'architect';
const procurement = 'contractor-procurement';
const integration = 'contractor-integration';
const root = '/api/model';
const historySchema = z.object({ items: z.array(revisionSchema) });

let db: Db;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  loadProjectEnv();
  db = createDatabase(testDatabaseUrls().runtime);
  app = await createApp(() => checkDatabase(db), undefined, {
    db,
    localDemo: true,
  });
  await app.ready();
  const seed = await app.inject({
    url: objectUrl(demoIds.supplierCapability),
    headers: headers(architect),
  });
  expect(
    seed.statusCode,
    'Migrate and seed archimesh_test before running integration tests.',
  ).toBe(200);
});

afterAll(async () => {
  try {
    await app?.close();
  } finally {
    await db?.destroy();
  }
});

function headers(actor: DemoIdentity) {
  return { host: 'localhost', [identityHeader]: actor };
}

function objectUrl(id: string) {
  return `${root}/objects/${id}`;
}

function create(
  input: Parameters<typeof serializeConcept>[0],
  scopeId = 'procurement',
): ModelOperation {
  return { kind: 'create', scopeId, markdown: serializeConcept(input) };
}

function capability(id: string, title: string) {
  return { id, type: 'capability' as const, title, body: title };
}

function commit(
  operations: ModelOperation[],
  actor: DemoIdentity = architect,
  requestId = randomUUID(),
) {
  return app.inject({
    method: 'POST',
    url: `${root}/changesets`,
    headers: headers(actor),
    payload: { requestId, operations },
  });
}

async function detail(
  id: string,
  actor: DemoIdentity = architect,
  revision?: string,
) {
  const url = objectUrl(id) + (revision ? `?revision=${revision}` : '');
  const response = await app.inject({ url, headers: headers(actor) });
  expect(response.statusCode, response.body).toBe(200);
  return modelObjectSchema.parse(response.json());
}

async function history(id: string, actor: DemoIdentity = architect) {
  const response = await app.inject({
    url: `${objectUrl(id)}/history`,
    headers: headers(actor),
  });
  expect(response.statusCode, response.body).toBe(200);
  return historySchema.parse(response.json()).items;
}

async function search(parameters: Record<string, string>, actor: DemoIdentity) {
  const response = await app.inject({
    url: `${root}/objects?${new URLSearchParams(parameters)}`,
    headers: headers(actor),
  });
  expect(response.statusCode, response.body).toBe(200);
  return objectListSchema.parse(response.json());
}

async function visibleIds(connection: Db, ids: string[]) {
  const selection = await sql<{ id: string }>`
    SELECT id FROM model_objects WHERE id = ANY(${ids}::uuid[]) ORDER BY id
  `.execute(connection);
  return selection.rows.map(({ id }) => id);
}

describe('local model authorization', () => {
  it('requires a recognized identity and refuses non-local requests', async () => {
    const url = `${root}/session`;
    const noIdentity = await app.inject({
      url,
      headers: { host: 'localhost' },
    });
    expect(noIdentity.statusCode).toBe(401);
    expect(noIdentity.headers['cache-control']).toBe('no-store');
    const unknownIdentity = await app.inject({
      url,
      headers: { ...headers(architect), [identityHeader]: 'unknown-principal' },
    });
    expect(unknownIdentity.statusCode).toBe(401);

    const disallowed = [
      { headers: { ...headers(architect), host: 'archimesh.example' } },
      { headers: headers(architect), remoteAddress: '192.0.2.4' },
      { headers: { ...headers(architect), 'sec-fetch-site': 'cross-site' } },
    ];
    for (const request of disallowed) {
      const response = await app.inject({ url, ...request });
      expect(response.statusCode, response.body).toBe(403);
    }
  });

  it('disables demo identities when the mode is off or production is active', async () => {
    const request = { url: `${root}/session`, headers: headers(architect) };
    const disabled = await createApp(() => checkDatabase(db), undefined, {
      db,
      localDemo: false,
    });
    try {
      expect((await disabled.inject(request)).statusCode).toBe(403);
      vi.stubEnv('NODE_ENV', 'production');
      expect((await app.inject(request)).statusCode).toBe(403);
    } finally {
      vi.unstubAllEnvs();
      await disabled.close();
    }
  });

  it.each([
    {
      actor: procurement,
      scope: 'procurement',
      allowedId: demoIds.procurementProject,
      hiddenScope: 'integration',
      hiddenTitle: 'Freight Event Integration',
      hiddenId: demoIds.integrationProject,
    },
    {
      actor: integration,
      scope: 'integration',
      allowedId: demoIds.integrationProject,
      hiddenScope: 'procurement',
      hiddenTitle: 'Procurement Modernization',
      hiddenId: demoIds.procurementProject,
    },
  ] as const)(
    'isolates the catalog, direct reads and history for $actor',
    async ({ actor, scope, allowedId, hiddenScope, hiddenTitle, hiddenId }) => {
      const sessionResponse = await app.inject({
        url: `${root}/session`,
        headers: headers(actor),
      });
      expect(sessionResponse.statusCode, sessionResponse.body).toBe(200);
      const session = sessionSchema.parse(sessionResponse.json());
      expect(session.identity).toBe(actor);
      expect(session.scopes.map(({ id, writable }) => [id, writable])).toEqual([
        ['shared', false],
        [scope, true],
      ]);

      expect((await detail(allowedId, actor)).scopeId).toBe(scope);
      expect((await history(allowedId, actor)).length).toBeGreaterThan(0);
      expect(
        (await search({ q: 'Supplier Intake', type: 'capability' }, actor))
          .items,
      ).toContainEqual(
        expect.objectContaining({ id: demoIds.supplierCapability }),
      );
      expect((await search({ scopeId: hiddenScope }, actor)).items).toEqual([]);
      expect(
        (await search({ q: hiddenTitle }, actor)).items,
      ).not.toContainEqual(expect.objectContaining({ id: hiddenId }));

      const hidden = await detail(hiddenId);
      const unknownId = randomUUID();
      for (const suffix of [
        '',
        '/history',
        '/neighborhood',
        `?revision=${hidden.revisionId}`,
      ]) {
        const blocked = await app.inject({
          url: objectUrl(hiddenId) + suffix,
          headers: headers(actor),
        });
        const absent = await app.inject({
          url: objectUrl(unknownId) + suffix,
          headers: headers(actor),
        });
        expect(blocked.statusCode).toBe(404);
        expect(absent.statusCode).toBe(404);
        expect(blocked.json()).toEqual(absent.json());
      }

      const old = await search(
        {
          scopeId: hiddenScope,
          recordedAt: hidden.updatedAt,
          effectiveOn: '2026-06-01',
        },
        actor,
      );
      expect(old.items).toEqual([]);
      expect(old.nextCursor).toBeNull();
    },
  );

  it('filters private relationships when exploring a shared provider', async () => {
    async function explore(actor: DemoIdentity) {
      const response = await app.inject({
        url: `${objectUrl(demoIds.supplierProvider)}/neighborhood`,
        headers: headers(actor),
      });
      expect(response.statusCode, response.body).toBe(200);
      return neighborhoodSchema.parse(response.json());
    }

    const allowed = await explore(procurement);
    expect(allowed.edges.map(({ id }) => id)).toContain(
      demoIds.proposedSupplierIntegration,
    );
    const hidden = await explore(integration);
    expect(hidden.edges.map(({ id }) => id)).toContain(
      demoIds.legacySupplierIntegration,
    );
    expect(hidden.edges.map(({ id }) => id)).not.toContain(
      demoIds.proposedSupplierIntegration,
    );
    expect(hidden.nodes.every(({ scopeId }) => scopeId !== 'procurement')).toBe(
      true,
    );
  });

  it('denies contractor writes to the other project or shared catalog', async () => {
    const restricted = await detail(demoIds.procurementProject);
    const shared = await detail(demoIds.supplierCapability);
    const id = randomUUID();
    for (const scope of ['procurement', 'shared']) {
      const denied = await commit(
        [create(capability(id, 'Integration outsider write'), scope)],
        integration,
      );
      expect(denied.statusCode, denied.body).toBe(404);
    }
    for (const target of [restricted, shared]) {
      const denied = await commit(
        [
          {
            kind: 'update',
            id: target.id,
            expectedRevisionId: target.revisionId,
            markdown: target.markdown,
          },
        ],
        integration,
      );
      expect(denied.statusCode, denied.body).toBe(404);
    }
    expect((await detail(restricted.id)).revisionId).toBe(
      restricted.revisionId,
    );
    expect((await detail(shared.id)).revisionId).toBe(shared.revisionId);
  });

  it('enforces PostgreSQL RLS on one reused physical connection', async () => {
    const ids = [
      demoIds.supplierCapability,
      demoIds.procurementProject,
      demoIds.integrationProject,
    ];
    await db.connection().execute(async (connection) => {
      expect(await visibleIds(connection, ids)).toEqual([]);
      await connection.transaction().execute(async (transaction) => {
        await sql`SELECT set_config('archimesh.actor', ${procurement}, true)`.execute(
          transaction,
        );
        expect(await visibleIds(transaction, ids)).toEqual(
          [demoIds.supplierCapability, demoIds.procurementProject].sort(),
        );
        const grants = await sql<{ actor: string; scope_id: string }>`
          SELECT actor, scope_id FROM model_scope_grants ORDER BY scope_id
        `.execute(transaction);
        expect(grants.rows).toEqual([
          { actor: procurement, scope_id: 'procurement' },
          { actor: procurement, scope_id: 'shared' },
        ]);
        const blocked = await sql`
          UPDATE model_objects SET title = title WHERE id = ANY(${[
            demoIds.supplierCapability,
            demoIds.integrationProject,
          ]}::uuid[])
        `.execute(transaction);
        expect(blocked.numAffectedRows).toBe(0n);
      });
      expect(await visibleIds(connection, ids)).toEqual([]);
      await connection.transaction().execute(async (transaction) => {
        await sql`SELECT set_config('archimesh.actor', ${integration}, true)`.execute(
          transaction,
        );
        expect(await visibleIds(transaction, ids)).toEqual(
          [demoIds.supplierCapability, demoIds.integrationProject].sort(),
        );
      });
      expect(await visibleIds(connection, ids)).toEqual([]);
    });
  });
});

describe('real model transactions', () => {
  it('deduplicates simultaneous retry requests and rejects stale concurrent writes', async () => {
    const id = randomUUID();
    const requestId = randomUUID();
    const operations = [create(capability(id, 'Concurrent fixture'))];
    const receipts = await Promise.all([
      commit(operations, architect, requestId),
      commit(operations, architect, requestId),
    ]);
    for (const receipt of receipts)
      expect(receipt.statusCode, receipt.body).toBe(201);
    expect(receipts[0].json()).toEqual(receipts[1].json());
    expect(await history(id)).toHaveLength(1);
    const reused = await commit(
      [create(capability(id, 'Changed payload'))],
      architect,
      requestId,
    );
    expect(reused.statusCode, reused.body).toBe(409);

    const prior = await detail(id);
    const updates = await Promise.all(
      ['First candidate', 'Second candidate'].map((title) =>
        commit([
          {
            kind: 'update',
            id,
            expectedRevisionId: prior.revisionId,
            markdown: serializeConcept(capability(id, title)),
          },
        ]),
      ),
    );
    expect(updates.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(await history(id)).toHaveLength(2);
  });

  it('rolls back an earlier write when a later insert hits a real unique constraint', async () => {
    const alreadyExists = randomUUID();
    const first = await commit([
      create(capability(alreadyExists, 'Collision target')),
    ]);
    expect(first.statusCode, first.body).toBe(201);
    const before = await detail(alreadyExists);
    const uncommitted = randomUUID();
    const requestId = randomUUID();
    const failed = await commit(
      [
        create(capability(uncommitted, 'Would-be earlier write')),
        create(capability(alreadyExists, 'Must roll back')),
      ],
      architect,
      requestId,
    );
    expect(failed.statusCode, failed.body).toBe(409);

    await db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('archimesh.actor', ${architect}, true)`.execute(
        tx,
      );
      expect(await visibleIds(tx, [uncommitted])).toEqual([]);
      const revisions =
        await sql`SELECT id FROM model_revisions WHERE object_id = ${uncommitted}::uuid`.execute(
          tx,
        );
      expect(revisions.rows).toEqual([]);
      const receipt =
        await sql`SELECT id FROM model_commits WHERE request_id = ${requestId}::uuid`.execute(
          tx,
        );
      expect(receipt.rows).toEqual([]);
    });
    expect((await detail(alreadyExists)).revisionId).toBe(before.revisionId);
  });

  it('rejects invalid graph batches and commits forward references and exactly one instance-of', async () => {
    const instanceId = randomUUID();
    const applicationId = randomUUID();
    const edgeId = randomUUID();
    const instance = create({
      id: instanceId,
      type: 'application-instance',
      title: 'Operational fixture instance',
      body: 'Synthetic application instance.',
      lifecycle: 'active',
      owner: 'Test Architecture',
    });
    const application = create({
      id: applicationId,
      type: 'application',
      title: 'Logical fixture application',
      body: 'Synthetic application.',
    });
    const edge = create({
      id: edgeId,
      type: 'relationship',
      title: 'Fixture instance-of',
      body: 'Synthetic instance-of relationship.',
      relationship: {
        type: 'instance-of',
        sourceId: instanceId,
        targetId: applicationId,
      },
    });

    const missingEdge = await commit([application, instance]);
    expect(missingEdge.statusCode, missingEdge.body).toBe(422);
    for (const id of [instanceId, applicationId]) {
      const failed = await app.inject({
        url: objectUrl(id),
        headers: headers(architect),
      });
      expect(failed.statusCode).toBe(404);
    }

    const valid = await commit([edge, instance, application]);
    expect(valid.statusCode, valid.body).toBe(201);
    expect((await detail(edgeId)).relationship).toEqual({
      type: 'instance-of',
      sourceId: instanceId,
      targetId: applicationId,
    });

    const duplicateEdge = await commit([
      create({
        id: randomUUID(),
        type: 'relationship',
        title: 'Duplicate instance-of',
        body: 'This would violate active instance cardinality.',
        relationship: {
          type: 'instance-of',
          sourceId: instanceId,
          targetId: applicationId,
        },
      }),
    ]);
    expect(duplicateEdge.statusCode, duplicateEdge.body).toBe(422);
  });

  it('saves layout under contractor identity without changing a member revision', async () => {
    const viewId = randomUUID();
    const member = await detail(demoIds.supplierProvider);
    const setup = await commit(
      [
        create({
          id: viewId,
          type: 'view',
          title: 'Independent layout fixture',
          body: 'Only the diagram coordinates should change.',
          view: {
            viewpoint: 'business-object-map',
            objectIds: [member.id],
            relationshipIds: [],
            positions: { [member.id]: { x: 10, y: 20 } },
          },
        }),
      ],
      procurement,
    );
    expect(setup.statusCode, setup.body).toBe(201);
    const [view] = changesetResultSchema.parse(setup.json()).objects;
    expect(view).toBeDefined();
    if (!view) throw new Error('View creation returned no object');
    expect(view.id).not.toBe(viewId);
    const positions = { [member.id]: { x: 140, y: 310 } };
    const saved = await app.inject({
      method: 'PATCH',
      url: `${root}/views/${view.id}/layout`,
      headers: headers(procurement),
      payload: {
        requestId: randomUUID(),
        expectedRevisionId: view.revisionId,
        positions,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const updated = await detail(view.id, procurement);
    expect(updated.revisionId).not.toBe(view.revisionId);
    expect(updated.view?.positions).toEqual(positions);
    expect(updated.view?.objectIds).toEqual([member.id]);
    expect((await detail(member.id)).revisionId).toBe(member.revisionId);
  });

  it('updates a saved view and a rewired relationship atomically', async () => {
    const edgeId = randomUUID();
    const viewId = randomUUID();
    const originalTarget = randomUUID();
    const newTarget = demoIds.supplierObject;
    const source = demoIds.supplierProvider;

    function edge(targetId: string) {
      return {
        id: edgeId,
        type: 'relationship' as const,
        title: 'Business map reads fixture',
        body: 'Synthetic read responsibility.',
        relationship: { type: 'reads' as const, sourceId: source, targetId },
      };
    }

    function view(targetId: string) {
      return {
        id: viewId,
        type: 'view' as const,
        title: 'Dependent business map fixture',
        body: 'The map includes both relationship endpoints.',
        view: {
          viewpoint: 'business-object-map' as const,
          objectIds: [source, targetId],
          relationshipIds: [edgeId],
        },
      };
    }

    const initial = await commit([
      create(edge(originalTarget)),
      create(view(originalTarget)),
      create({
        id: originalTarget,
        type: 'business-object',
        title: 'Initial relationship target',
        body: 'Synthetic data object.',
      }),
    ]);
    expect(initial.statusCode, initial.body).toBe(201);
    const priorEdge = await detail(edgeId);
    const priorView = await detail(viewId);
    const rewire: ModelOperation = {
      kind: 'update',
      id: edgeId,
      expectedRevisionId: priorEdge.revisionId,
      markdown: serializeConcept(edge(newTarget)),
    };
    const rejected = await commit([rewire]);
    expect(rejected.statusCode, rejected.body).toBe(422);
    expect((await detail(edgeId)).revisionId).toBe(priorEdge.revisionId);

    const accepted = await commit([
      rewire,
      {
        kind: 'update',
        id: viewId,
        expectedRevisionId: priorView.revisionId,
        markdown: serializeConcept(view(newTarget)),
      },
    ]);
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect((await detail(edgeId)).relationship?.targetId).toBe(newTarget);
    expect((await detail(viewId)).view?.objectIds).toEqual([source, newTarget]);
  });

  it('selects half-open effective intervals and retains prior canonical revisions', async () => {
    const id = randomUUID();
    const searchTerm = `Temporal fixture ${id}`;
    const prior = {
      ...capability(id, `${searchTerm} baseline`),
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-01-01',
    };
    const initial = await commit([create(prior)]);
    expect(initial.statusCode, initial.body).toBe(201);
    const old = await detail(id);
    const target = {
      ...capability(id, `${searchTerm} target`),
      effectiveFrom: '2027-01-01',
    };
    const changed = await commit([
      {
        kind: 'update',
        id,
        expectedRevisionId: old.revisionId,
        markdown: serializeConcept(target),
      },
    ]);
    expect(changed.statusCode, changed.body).toBe(201);

    for (const [effectiveOn, expected] of [
      ['2026-12-31', prior.title],
      ['2027-01-01', target.title],
    ]) {
      const listed = await search({ q: searchTerm, effectiveOn }, procurement);
      expect(listed.items.map(({ title }) => title)).toEqual([expected]);
    }
    const before = await search(
      {
        q: searchTerm,
        recordedAt: '2000-01-01T00:00:00.000Z',
      },
      procurement,
    );
    expect(before.items).toEqual([]);
    expect((await detail(id, procurement, old.revisionId)).markdown).toBe(
      old.markdown,
    );
  });
});

describe('reuse, proposals and interchange', () => {
  it('returns the shared supplier provider and hides a private reuse relationship', async () => {
    const privateEdge = randomUUID();
    const stored = await commit([
      create({
        id: privateEdge,
        type: 'relationship',
        title: 'Private procurement reuse fixture',
        body: 'This private assertion must only appear in the procurement scope.',
        relationship: {
          type: 'supports',
          sourceId: demoIds.supplierProvider,
          targetId: demoIds.supplierCapability,
        },
      }),
    ]);
    expect(stored.statusCode, stored.body).toBe(201);

    const schema = z.object({
      capability: modelSummarySchema,
      providers: z.array(
        z.object({
          object: modelSummarySchema,
          relationship: modelSummarySchema,
        }),
      ),
      partial: z.boolean(),
    });
    for (const actor of [procurement, integration] as const) {
      const response = await app.inject({
        url: `${root}/providers/${demoIds.supplierCapability}`,
        headers: headers(actor),
      });
      expect(response.statusCode, response.body).toBe(200);
      const result = schema.parse(response.json());
      expect(result.capability.id).toBe(demoIds.supplierCapability);
      expect(result.providers).toContainEqual(
        expect.objectContaining({
          object: expect.objectContaining({ id: demoIds.supplierProvider }),
          relationship: expect.objectContaining({
            id: demoIds.supplierRelationship,
          }),
        }),
      );
      expect(
        result.providers.some(
          ({ relationship }) => relationship.id === privateEdge,
        ),
      ).toBe(actor === procurement);
    }
  });

  it('keeps a pinned retirement proposal separate from the actual object', async () => {
    const id = randomUUID();
    const setup = await commit([
      create({
        ...capability(id, 'Scenario baseline fixture'),
        lifecycle: 'active',
      }),
    ]);
    expect(setup.statusCode, setup.body).toBe(201);
    const initial = await detail(id, procurement);
    const proposed = await app.inject({
      method: 'POST',
      url: `${root}/scenarios`,
      headers: headers(procurement),
      payload: {
        name: 'Retirement proposal fixture',
        scopeId: 'procurement',
        operations: [
          { kind: 'retire', id, expectedRevisionId: initial.revisionId },
        ],
      },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposal = z
      .object({ id: z.uuid(), baseRecordedAt: z.iso.datetime() })
      .parse(proposed.json());

    const url = `${root}/scenarios/${proposal.id}`;
    const visible = await app.inject({ url, headers: headers(procurement) });
    expect(visible.statusCode, visible.body).toBe(200);
    expect(visible.json()).toMatchObject({
      ...proposal,
      changes: [
        {
          kind: 'retire',
          id,
          before: { revisionId: initial.revisionId, lifecycle: 'active' },
          after: null,
        },
      ],
    });
    expect(
      (await app.inject({ url, headers: headers(integration) })).statusCode,
    ).toBe(404);
    const actual = await detail(id, procurement);
    expect(actual.revisionId).toBe(initial.revisionId);
    expect(actual.retired).toBe(false);
  });

  it('round-trips a canonical OKF document under the same identity and filters exports', async () => {
    const id = randomUUID();
    const path = `objects/${id}.md`;
    const markdown = serializeConcept({
      ...capability(id, 'Interchange fixture'),
      body: 'Preserve this Markdown body and profile metadata.',
      attributes: { syntheticFixture: ['one', 'two'] },
    });
    function bundleFor(objectPath: string) {
      const manifest = {
        okf_version: okfVersion,
        'x-archimesh-bundle': {
          profile: 'archimesh-v0.1',
          recordedAt: '2026-01-01T00:00:00.000Z',
          effectiveOn: null,
          entries: [
            {
              path: objectPath,
              scopeId: 'procurement',
              revisionId: randomUUID(),
            },
          ],
        },
      };
      return {
        requestId: randomUUID(),
        bundle: {
          files: [
            {
              path: 'index.md',
              markdown: `---\n${JSON.stringify(manifest)}\n---\n# Fixture\n`,
            },
            { path: objectPath, markdown },
          ],
        },
      };
    }
    async function importFixture(
      payload: ReturnType<typeof bundleFor>,
      actor: DemoIdentity,
    ) {
      return app.inject({
        method: 'POST',
        url: `${root}/bundles/import`,
        headers: headers(actor),
        payload,
      });
    }
    const rejectedPath = await importFixture(
      bundleFor(`../${id}.md`),
      architect,
    );
    expect(rejectedPath.statusCode, rejectedPath.body).toBe(422);
    expect(
      (await app.inject({ url: objectUrl(id), headers: headers(architect) }))
        .statusCode,
    ).toBe(404);

    const imported = await importFixture(bundleFor(path), architect);
    expect(imported.statusCode, imported.body).toBe(201);
    const [receipt] = changesetResultSchema.parse(imported.json()).objects;
    expect(receipt?.id).toBe(id);
    expect((await importFixture(bundleFor(path), procurement)).statusCode).toBe(
      403,
    );

    const url = `${root}/bundle?scopeId=procurement&type=capability`;
    const authorized = await app.inject({ url, headers: headers(procurement) });
    expect(authorized.statusCode, authorized.body).toBe(200);
    const exported = bundleSchema.parse(authorized.json());
    expect(exported.files).toContainEqual({ path, markdown });
    expect(exported.files[0]?.markdown).toContain(receipt?.revisionId);
    const denied = await app.inject({ url, headers: headers(integration) });
    expect(denied.statusCode, denied.body).toBe(422);
    expect(denied.body).not.toContain(id);
    expect(denied.body).not.toContain('Interchange fixture');
  });
});
