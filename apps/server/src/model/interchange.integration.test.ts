import { randomUUID } from 'node:crypto';
import { serializeConcept } from '@archimesh/core';
import { identityHeader, type DemoIdentity } from '@archimesh/contracts';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../app.js';
import { checkDatabase, createDatabase } from '../db.js';
import { demoIds } from '../demo-bundle.js';
import { loadProjectEnv, testDatabaseUrls } from '../env.js';

loadProjectEnv();
const db = createDatabase(testDatabaseUrls().runtime);
let app: Awaited<ReturnType<typeof createApp>>;
const auth = (identity: DemoIdentity) => ({ [identityHeader]: identity });

beforeAll(async () => {
  app = await createApp(() => checkDatabase(db), undefined, {
    db,
    localDemo: true,
  });
});
afterAll(async () => {
  await app.close();
  await db.destroy();
});

describe('scoped reuse and interchange', () => {
  test('finds the supplier provider through a first-class supports relationship', async () => {
    const response = await app.inject({
      url: `/api/model/providers/${demoIds.supplierCapability}`,
      headers: auth('contractor-procurement'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      capability: { id: demoIds.supplierCapability },
      providers: expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: demoIds.supplierProvider }),
          relationship: expect.objectContaining({
            relationship: expect.objectContaining({ type: 'supports' }),
          }),
        }),
      ]),
      partial: false,
    });
  });

  test('pins a future scenario and leaves actual content and foreign access unchanged', async () => {
    const url = `/api/model/objects/${demoIds.proposedSupplierIntegration}`;
    const actor = auth('contractor-procurement');
    const object = (await app.inject({ url, headers: actor })).json();
    const proposal = await app.inject({
      method: 'POST',
      url: '/api/model/scenarios',
      headers: actor,
      payload: {
        name: 'Activate future pilot',
        scopeId: 'procurement',
        operations: [
          {
            kind: 'update',
            id: object.id,
            expectedRevisionId: object.revisionId,
            markdown: serializeConcept({
              id: object.id,
              type: object.type,
              title: 'Pilot target integration',
              body: 'The planned route is separate from the operating model.',
              lifecycle: 'active',
              relationship: object.relationship,
              effectiveFrom: '2031-01-01',
            }),
          },
        ],
      },
    });
    expect(proposal.statusCode).toBe(201);
    const proposalUrl = `/api/model/scenarios/${proposal.json().id}`;
    const diff = await app.inject({ url: proposalUrl, headers: actor });
    expect(diff.json().changes).toEqual([
      expect.objectContaining({
        kind: 'change',
        id: object.id,
        before: expect.objectContaining({ revisionId: object.revisionId }),
        after: expect.objectContaining({
          effectiveFrom: '2031-01-01',
          lifecycle: 'active',
        }),
      }),
    ]);
    expect((await app.inject({ url, headers: actor })).json()).toEqual(object);
    expect(
      (
        await app.inject({
          url: proposalUrl,
          headers: auth('contractor-integration'),
        })
      ).statusCode,
    ).toBe(404);
  });

  test('imports exact stable concept paths and re-exports the canonical source under policy', async () => {
    const id = randomUUID();
    const path = `objects/${id}.md`;
    const markdown = serializeConcept({
      id,
      type: 'viewpoint',
      title: 'Round-trip test viewpoint',
      body: 'This body and unknown metadata must round-trip.',
      attributes: { example: { keep: true } },
    });
    const manifest = {
      okf_version: '0.3',
      'x-archimesh-bundle': {
        profile: 'archimesh-v0.1',
        recordedAt: '2025-01-01T00:00:00.000Z',
        effectiveOn: null,
        entries: [{ path, scopeId: 'integration', revisionId: randomUUID() }],
      },
    };
    const index = `---\n${JSON.stringify(manifest)}\n---\n# Index\n`;
    const payload = {
      requestId: randomUUID(),
      bundle: {
        files: [
          { path: 'index.md', markdown: index },
          { path, markdown },
        ],
      },
    };
    const install = (identity: DemoIdentity, content: typeof payload) =>
      app.inject({
        method: 'POST',
        url: '/api/model/bundles/import',
        headers: auth(identity),
        payload: content,
      });

    expect((await install('contractor-integration', payload)).statusCode).toBe(
      403,
    );
    const unsafe = {
      ...payload,
      bundle: {
        files: [
          { path: 'index.md', markdown: index },
          { path: '../model.md', markdown },
        ],
      },
    };
    expect((await install('architect', unsafe)).statusCode).toBe(422);
    const loaded = await install('architect', payload);
    expect(loaded.statusCode).toBe(201);
    expect(loaded.json().objects).toEqual([expect.objectContaining({ id })]);
    expect((await install('architect', payload)).json()).toEqual(loaded.json());

    const url = '/api/model/bundle?scopeId=integration&type=viewpoint';
    const exported = await app.inject({
      url,
      headers: auth('contractor-integration'),
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().files).toEqual(
      expect.arrayContaining([{ path, markdown }]),
    );
    const denied = await app.inject({
      url,
      headers: auth('contractor-procurement'),
    });
    expect(denied.statusCode).toBe(422);
    expect(denied.body).not.toContain(id);
  });
});
