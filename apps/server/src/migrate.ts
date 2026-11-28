import { createDatabase } from './db.js';
import { loadProjectEnv, testDatabaseUrls } from './env.js';
import { migrateDatabase } from './migrations.js';

loadProjectEnv();
const connectionString = process.argv.includes('--test')
  ? testDatabaseUrls().migration
  : (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL);
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required');
const db = createDatabase(connectionString);

try {
  for (const result of await migrateDatabase(db)) {
    console.log(`${result.migrationName}: ${result.status}`);
  }
} finally {
  await db.destroy();
}
