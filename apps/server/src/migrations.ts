import { Migrator, type Kysely } from 'kysely';
import * as initial from './migrations/0001-model.js';

export async function migrateDatabase(db: Kysely<Record<string, never>>) {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => ({ '0001-model': initial }) },
  });
  const result = await migrator.migrateToLatest();
  if (result.error) throw result.error;
  return result.results ?? [];
}
