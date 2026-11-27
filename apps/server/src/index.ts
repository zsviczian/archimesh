import { createApp } from './app.js';
import { checkDatabase, createDatabase } from './db.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const db = createDatabase(connectionString);
const app = await createApp(() => checkDatabase(db), process.env.STATIC_DIR);
app.addHook('onClose', async () => db.destroy());

try {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
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
