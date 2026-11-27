import { loadProjectEnv } from './env.js';
import { createApp } from './app.js';
import { checkDatabase, createDatabase } from './db.js';

loadProjectEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const db = createDatabase(connectionString);
const host =
  process.env.HOST ??
  (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const localDemo =
  process.env.NODE_ENV !== 'production' &&
  ['127.0.0.1', 'localhost', '::1'].includes(host) &&
  (process.argv.includes('--local-demo') ||
    process.env.ARCHIMESH_DEV_AUTH === '1');
const app = await createApp(() => checkDatabase(db), process.env.STATIC_DIR, {
  db,
  localDemo,
});
app.addHook('onClose', async () => db.destroy());

try {
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host,
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
