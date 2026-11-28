import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  changesetSchema,
  modelObjectSchema,
  objectListSchema,
} from '@archimesh/contracts';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';
import { createModelClient, maxPayloadBytes } from './api.js';

function transport(apiUrl: string, identity = 'contractor-procurement') {
  return new StdioClientTransport({
    command: process.execPath,
    args: [
      '--import',
      'tsx',
      fileURLToPath(new URL('./mcp.ts', import.meta.url)),
    ],
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ARCHIMESH_API_URL: apiUrl, ARCHIMESH_IDENTITY: identity },
    stderr: 'pipe',
  });
}

describe('local model client', () => {
  it.each([
    'https://127.0.0.1:3000',
    'http://127.0.0.1:3000/api/unrelated',
    'http://127.0.0.1:3000/?redirect=somewhere',
    'http://127.0.0.1:3000/#fragment',
    'http://fake:fake@127.0.0.1:3000',
    'http://192.0.2.10:3000',
    'http://localhost:3000',
    'file:///local/path',
  ])('rejects unsafe configuration %s before issuing a request', (url) => {
    expect(() =>
      createModelClient({
        ARCHIMESH_IDENTITY: 'architect',
        ARCHIMESH_API_URL: url,
      }),
    ).toThrow('numeric loopback HTTP origin');
  });

  it('requires an explicit configured identity', () => {
    expect(() => createModelClient({})).toThrow('Set ARCHIMESH_IDENTITY');
  });

  it('connects over real stdio, validates tool input, and keeps redirects off', async () => {
    const requests: string[] = [];
    const identities: (string | string[] | undefined)[] = [];
    const fixture = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      requests.push(url.pathname);
      identities.push(request.headers['x-archimesh-identity']);
      if (url.searchParams.get('q') === 'redirect') {
        response.writeHead(302, { location: '/unexpected' }).end();
      } else if (url.searchParams.get('q') === 'too much') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"body":"' + '0'.repeat(maxPayloadBytes) + '"}');
      } else {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ items: [], nextCursor: null }));
      }
    });
    fixture.listen(0, '127.0.0.1');
    await once(fixture, 'listening');
    const address = fixture.address();
    if (!address || typeof address === 'string')
      throw new Error('No fixture port');
    const child = transport('http://127.0.0.1:' + address.port);
    const client = new Client({ name: 'archimesh-test', version: '0.1.0' });
    try {
      await client.connect(child);
      const { tools } = await client.listTools();
      expect(tools.map(({ name }) => name).sort()).toEqual([
        'create_changeset',
        'export_context',
        'find_capability_providers',
        'get_metamodel',
        'get_neighborhood',
        'get_object',
        'search_objects',
        'validate_changeset',
      ]);
      expect(
        tools.find(({ name }) => name === 'create_changeset')?.annotations
          ?.readOnlyHint,
      ).toBe(false);
      const result = await client.callTool({
        name: 'search_objects',
        arguments: { q: 'nothing' },
      });
      expect(result).toMatchObject({
        structuredContent: { items: [], nextCursor: null },
      });
      for (const args of [
        { q: 'redirect' },
        { q: 'too much' },
        { q: 'unsafe', identity: 'architect' },
      ]) {
        const rejected = await client.callTool({
          name: 'search_objects',
          arguments: args,
        });
        expect(rejected).toMatchObject({ isError: true });
      }
      expect(requests).toEqual([
        '/api/model/objects',
        '/api/model/objects',
        '/api/model/objects',
      ]);
      expect(identities).toEqual(Array(3).fill('contractor-procurement'));
    } finally {
      try {
        await client.close();
      } finally {
        await new Promise<void>((resolve, reject) => {
          fixture.close((error) => (error ? reject(error) : resolve()));
        });
      }
    }
  }, 15_000);
});

const liveUrl = process.env.ARCHIMESH_TEST_MODEL_TOOLS_URL;
it.skipIf(!liveUrl)(
  'discovers a reusable supplier provider through stdio against seeded PostgreSQL',
  async () => {
    const client = new Client({
      name: 'archimesh-live-test',
      version: '0.1.0',
    });
    try {
      await client.connect(transport(liveUrl!));
      const searched = await client.callTool({
        name: 'search_objects',
        arguments: {
          q: 'Supplier Onboarding',
          type: 'capability',
          scopeId: 'shared',
        },
      });
      expect(searched).toMatchObject({
        structuredContent: {
          items: expect.arrayContaining([
            expect.objectContaining({ title: 'Supplier Onboarding' }),
          ]),
        },
      });
      const capability = objectListSchema
        .parse(searched.structuredContent)
        .items.find(({ title }) => title === 'Supplier Onboarding');
      if (!capability)
        throw new Error('Seeded Supplier Onboarding capability is missing');
      const capabilityId = capability.id;
      const found = await client.callTool({
        name: 'find_capability_providers',
        arguments: { id: capabilityId },
      });
      expect(found).toMatchObject({
        structuredContent: {
          capability: { id: capabilityId },
          providers: expect.arrayContaining([
            {
              object: expect.objectContaining({
                title: 'Supplier Harbor North',
              }),
              relationship: expect.objectContaining({
                relationship: {
                  type: 'supports',
                  sourceId: expect.any(String),
                  targetId: capabilityId,
                },
              }),
            },
          ]),
        },
      });
      const object = await client.callTool({
        name: 'get_object',
        arguments: { id: capabilityId },
      });
      expect(object).toMatchObject({
        structuredContent: {
          id: capabilityId,
          markdown: expect.stringContaining('Supplier Onboarding'),
        },
      });
      const neighbor = await client.callTool({
        name: 'get_neighborhood',
        arguments: { id: capabilityId },
      });
      expect(neighbor).toMatchObject({
        structuredContent: {
          nodes: expect.any(Array),
          edges: expect.any(Array),
          partial: false,
        },
      });
      const file = await client.callTool({
        name: 'export_context',
        arguments: { scopeId: 'procurement' },
      });
      expect(file).toMatchObject({
        structuredContent: {
          files: expect.arrayContaining([
            expect.objectContaining({ path: 'index.md' }),
          ]),
        },
      });
      const change = await client.callTool({
        name: 'validate_changeset',
        arguments: {
          requestId: randomUUID(),
          operations: [
            {
              kind: 'retire',
              id: capabilityId,
              expectedRevisionId: randomUUID(),
            },
          ],
        },
      });
      expect(change).toMatchObject({ isError: true });
      const hidden = await client.callTool({
        name: 'search_objects',
        arguments: { scopeId: 'integration' },
      });
      expect(hidden).toMatchObject({
        structuredContent: { items: [], nextCursor: null },
      });
    } finally {
      await client.close();
    }
  },
  20_000,
);

it.skipIf(!liveUrl || process.env.ARCHIMESH_TEST_MODEL_TOOLS_DRAFT !== '1')(
  'saves a scoped reuse draft against the disposable API with the actual project revision unchanged',
  async () => {
    const apiUrl = liveUrl!;
    const client = new Client({
      name: 'archimesh-draft-test',
      version: '0.1.0',
    });
    try {
      await client.connect(transport(apiUrl));
      const searched = await client.callTool({
        name: 'search_objects',
        arguments: {
          q: 'Procurement Modernization',
          scopeId: 'procurement',
          type: 'project',
        },
      });
      const projectId = objectListSchema.parse(searched.structuredContent)
        .items[0]!.id;
      const readProject = async () => {
        const result = await client.callTool({
          name: 'get_object',
          arguments: { id: projectId },
        });
        return modelObjectSchema.parse(result.structuredContent);
      };
      const before = await readProject();
      const proposal = 'Reuse Supplier Harbor North for supplier validation.';
      const operations = changesetSchema.shape.operations.parse([
        {
          kind: 'update',
          id: projectId,
          expectedRevisionId: before.revisionId,
          markdown:
            before.markdown + '\n## Reuse proposal\n\n' + proposal + '\n',
        },
      ]);
      const validation = await client.callTool({
        name: 'validate_changeset',
        arguments: { requestId: randomUUID(), operations },
      });
      expect(validation).toMatchObject({
        structuredContent: { valid: true, issues: [] },
      });
      const draft = await client.callTool({
        name: 'create_changeset',
        arguments: {
          name: 'MCP test reuse proposal',
          scopeId: before.scopeId,
          operations,
        },
      });
      expect(draft).toMatchObject({
        structuredContent: {
          id: expect.any(String),
          scopeId: 'procurement',
          baseRecordedAt: expect.any(String),
        },
      });
      const { id } = draft.structuredContent as { id: string };
      const response = await fetch(
        new URL('/api/model/scenarios/' + id, apiUrl),
        {
          redirect: 'error',
          headers: { 'x-archimesh-identity': 'contractor-procurement' },
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        changes: [
          {
            id: projectId,
            before: { revisionId: before.revisionId },
            after: { markdown: expect.stringContaining(proposal) },
          },
        ],
      });
      expect(await readProject()).toEqual(before);
    } finally {
      await client.close();
    }
  },
  20_000,
);
