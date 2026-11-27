import { parseConcept, serializeConcept } from '@archimesh/core';
import { getObject } from './model/queries.js';
import { createScenario } from './model/scenarios.js';
import { changesetSchema } from '@archimesh/contracts';
import { createDatabase } from './db.js';
import { buildDemoBundle, demoIds } from './demo-bundle.js';
import { loadProjectEnv, localDatabaseUrl, testDatabaseUrls } from './env.js';
import { commitChangeset } from './model/commands.js';

loadProjectEnv();
const testRun = process.argv.includes('--test');
const url = testRun ? testDatabaseUrls().runtime : process.env.DATABASE_URL;
if (!url || process.env.NODE_ENV === 'production') {
  throw new Error(
    'Synthetic seeding requires an explicit local ArchiMesh database',
  );
}
localDatabaseUrl(url, testRun ? 'archimesh_test' : 'archimesh');

const db = createDatabase(url);
try {
  const seed = changesetSchema.parse({
    requestId: '10101010-1000-4000-8000-000000000001',
    operations: buildDemoBundle().map(({ scopeId, markdown }) => ({
      kind: 'create',
      scopeId,
      markdown,
    })),
  });
  const result = await commitChangeset(db, 'architect', seed);
  const link = await getObject(
    db,
    'architect',
    demoIds.proposedSupplierIntegration,
  );
  const candidate = parseConcept(link.markdown);
  await createScenario(
    db,
    'architect',
    {
      name: 'Activate the proposed supplier integration',
      scopeId: link.scopeId,
      operations: [
        {
          kind: 'update',
          id: link.id,
          expectedRevisionId: link.revisionId,
          markdown: serializeConcept({
            ...candidate,
            lifecycle: 'active',
            effectiveFrom: '2030-01-01',
          }),
        },
      ],
    },
    '10101010-1000-4000-8000-000000000002',
  );
  console.log(
    `Alderfen Works demo available: ${result.objects.length} documents (commit ${result.commitId})`,
  );
} finally {
  await db.destroy();
}
