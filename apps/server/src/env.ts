import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export function loadProjectEnv() {
  const file = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(file)) loadEnvFile(file);
}

export function localDatabaseUrl(
  value: string,
  database: 'archimesh' | 'archimesh_test',
) {
  const url = new URL(value);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== `/${database}` ||
    url.search ||
    url.hash
  ) {
    throw new Error(`A loopback PostgreSQL URL for ${database} is required`);
  }
  return url;
}

export function testDatabaseUrls() {
  const runtime = process.env.TEST_DATABASE_URL;
  const migration = process.env.TEST_MIGRATION_DATABASE_URL ?? runtime;
  if (!runtime || !migration) {
    throw new Error('TEST_DATABASE_URL is required for database tests');
  }
  if (
    localDatabaseUrl(runtime, 'archimesh_test').host !==
    localDatabaseUrl(migration, 'archimesh_test').host
  ) {
    throw new Error(
      'Test runtime and migration URLs must target the same host and port',
    );
  }
  return { runtime, migration };
}
