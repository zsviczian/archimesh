import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

export function createDatabase(connectionString: string) {
  return new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 }),
    }),
  });
}

export async function checkDatabase(db: Kysely<Record<string, never>>) {
  await sql`select 1`.execute(db);
}
