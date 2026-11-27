import { sql } from 'kysely';
import { createDatabase } from './db.js';
import { loadProjectEnv, testDatabaseUrls } from './env.js';

loadProjectEnv();
const { runtime, migration } = testDatabaseUrls();
const pairs = [
  ['archimesh', process.env.DATABASE_URL, process.env.MIGRATION_DATABASE_URL],
  ['archimesh_test', runtime, migration],
] as const;

for (const [expected, appUrl, ownerUrl] of pairs) {
  if (!appUrl || !ownerUrl)
    throw new Error(`Missing connection settings for ${expected}`);
  for (const [kind, url] of [
    ['runtime', appUrl],
    ['migration', ownerUrl],
  ] as const) {
    const db = createDatabase(url);
    try {
      const result = await sql<{
        database: string;
        superuser: boolean;
        bypassrls: boolean;
        owns_database: boolean;
      }>`
        SELECT current_database() AS database, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls,
          d.datdba = r.oid AS owns_database
        FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
        WHERE r.rolname = current_user
      `.execute(db);
      const row = result.rows[0];
      if (
        row?.database !== expected ||
        row.superuser ||
        row.bypassrls ||
        row.owns_database !== (kind === 'migration')
      ) {
        throw new Error(
          `Unexpected ${kind} database or privileges for ${expected}`,
        );
      }
      console.log(`Verified ${expected} ${kind} connection and privileges`);
    } finally {
      await db.destroy();
    }
  }
}
