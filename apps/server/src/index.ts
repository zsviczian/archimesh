import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './env.js';
import { createApp } from './app.js';
import { serverRuntime } from './auth/runtime.js';
import { checkDatabase, createDatabase } from './db.js';

loadProjectEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const runtime = await serverRuntime(process.env, process.argv.slice(2));
const staticDir =
  process.env.STATIC_DIR ??
  (runtime.serveWeb
    ? fileURLToPath(new URL('../../web/dist/', import.meta.url))
    : undefined);
const db = createDatabase(connectionString);
const app = await createApp(
  () => checkDatabase(db),
  staticDir,
  {
    db,
    localDemo: false,
    access: runtime.access,
  },
  runtime.tls,
);
app.addHook('onClose', async () => db.destroy());

try {
  await app.listen({ port: runtime.port, host: runtime.host });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
