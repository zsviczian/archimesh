import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export function loadProjectEnv() {
  const file = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(file)) loadEnvFile(file);
}

export function testDatabaseUrls() {
  const runtime = process.env.TEST_DATABASE_URL;
  const migration = process.env.TEST_MIGRATION_DATABASE_URL ?? runtime;
  if (!runtime || !migration)
    throw new Error('TEST_DATABASE_URL is required for database tests');
  const urls = [runtime, migration].map((value) => new URL(value));
  for (const url of urls) {
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/archimesh_test' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Database tests require a loopback PostgreSQL URL for archimesh_test',
      );
    }
  }
  if (urls[0]?.host !== urls[1]?.host) {
    throw new Error(
      'Test runtime and migration URLs must target the same host and port',
    );
  }
  return { runtime, migration };
}
