import { loadProjectEnv, testDatabaseUrls } from './env.js';
import { FileMigrationProvider, Migrator } from 'kysely';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createDatabase } from './db.js';

loadProjectEnv();
const connectionString = process.argv.includes('--test')
  ? testDatabaseUrls().migration
  : (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL);
if (!connectionString) throw new Error('DATABASE_URL is required');
const db = createDatabase(connectionString);

try {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve('migrations'),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    console.log(`${result.migrationName}: ${result.status}`);
  }
  if (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  }
} finally {
  await db.destroy();
}
