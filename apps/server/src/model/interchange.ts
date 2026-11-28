import { z } from 'zod';
import {
  bundleSchema,
  maxModelPayloadBytes,
  type DemoIdentity,
  type KnowledgeBundle,
} from '@archimesh/contracts';
import {
  ConceptError,
  okfVersion,
  parseConcept,
  parseSafeFrontmatter,
} from '@archimesh/core';
import { commitChangeset } from './commands.js';
import { listInTransaction, listQuery } from './queries.js';
import {
  invalid,
  loadDocument,
  ModelError,
  readModel,
  type Db,
} from './store.js';

const bundleProfile = 'archimesh-v0.1';
const bundleFilter = listQuery.pick({
  scopeId: true,
  type: true,
  recordedAt: true,
  effectiveOn: true,
});
export const exportFilter = bundleFilter;
export const importRequest = z
  .object({ requestId: z.uuid(), bundle: bundleSchema })
  .strict();

const entrySchema = z
  .object({
    path: z.string(),
    scopeId: z.string().min(1).max(64),
    revisionId: z.uuid(),
  })
  .strict();

const manifestSchema = z.object({
  okf_version: z.literal(okfVersion),
  'x-archimesh-bundle': z
    .object({
      profile: z.literal(bundleProfile),
      recordedAt: z.iso.datetime(),
      effectiveOn: z.iso.date().nullable(),
      entries: z.array(entrySchema).min(1).max(128),
    })
    .strict(),
});

type ManifestEntry = z.infer<typeof entrySchema>;

export function exportBundle(
  db: Db,
  actor: DemoIdentity,
  filter: z.infer<typeof exportFilter>,
) {
  return readModel(db, actor, async (tx) => {
    const recordedAt = filter.recordedAt ?? new Date().toISOString();
    const first = await listInTransaction(tx, {
      ...filter,
      recordedAt,
      limit: 100,
    });
    const more = first.nextCursor
      ? await listInTransaction(tx, {
          ...filter,
          recordedAt,
          limit: 28,
          cursor: first.nextCursor,
        })
      : { items: [], nextCursor: null };
    if (more.nextCursor)
      throw invalid(
        'Select a narrower scope or type to export up to 128 objects',
      );
    const selected = first.items.concat(more.items);
    if (!selected.length)
      throw invalid('No accessible documents match this export');

    const entries: ManifestEntry[] = [];
    const files: KnowledgeBundle['files'] = [];
    for (const item of selected) {
      const path = `objects/${item.id}.md`;
      const document = await loadDocument(tx, item.id, item.revisionId);
      entries.push({
        path,
        scopeId: item.scopeId,
        revisionId: item.revisionId,
      });
      files.push({ path, markdown: document.markdown });
    }

    const manifest = {
      okf_version: okfVersion,
      'x-archimesh-bundle': {
        profile: bundleProfile,
        recordedAt,
        effectiveOn: filter.effectiveOn ?? null,
        entries,
      },
    };
    const links = selected
      .map(({ id }) => `- [${id}](objects/${id}.md)`)
      .join('\n');
    const bundle: KnowledgeBundle = {
      files: [
        {
          path: 'index.md',
          markdown: `---\n${JSON.stringify(manifest, null, 2)}\n---\n# ArchiMesh knowledge\n\n${links}\n`,
        },
        ...files,
      ],
    };
    const envelope = JSON.stringify({
      requestId: '00000000-0000-4000-8000-000000000000',
      bundle,
    });
    if (Buffer.byteLength(envelope) > maxModelPayloadBytes) {
      throw invalid(
        'Select a narrower scope or type to export an importable bundle',
      );
    }
    return bundle;
  });
}

function readManifest(markdown: string) {
  try {
    return manifestSchema.parse(parseSafeFrontmatter(markdown))[
      'x-archimesh-bundle'
    ];
  } catch {
    throw invalid('Invalid ArchiMesh bundle manifest');
  }
}

export async function importBundle(
  db: Db,
  actor: DemoIdentity,
  request: z.infer<typeof importRequest>,
) {
  if (actor !== 'architect')
    throw new ModelError(403, 'Bundle import requires the architect identity');
  const files = new Map(
    request.bundle.files.map(({ path, markdown }) => [path, markdown]),
  );
  if (files.size !== request.bundle.files.length)
    throw invalid('Bundle paths must be unique');
  const index = files.get('index.md');
  if (!index) throw invalid('Bundle index.md is missing');
  const manifest = readManifest(index);
  files.delete('index.md');
  if (manifest.entries.length !== files.size)
    throw invalid('Bundle paths must match the manifest');

  const operations = [];
  for (const entry of manifest.entries) {
    const markdown = files.get(entry.path);
    if (!markdown) throw invalid('Bundle paths must match the manifest');
    try {
      if (entry.path !== `objects/${parseConcept(markdown).id}.md`) {
        throw invalid('Every bundle object must use its exact stable ID path');
      }
    } catch (error) {
      if (error instanceof ConceptError) throw invalid(error.message);
      throw error;
    }
    files.delete(entry.path);
    operations.push({
      kind: 'create' as const,
      scopeId: entry.scopeId,
      markdown,
    });
  }
  return commitChangeset(db, actor, {
    requestId: request.requestId,
    operations,
  });
}
