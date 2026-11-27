import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import fastifyStatic from '@fastify/static';
import { healthSchema } from '@archimesh/contracts';
import { z } from 'zod';

export async function createApp(
  checkDatabase: () => Promise<void>,
  staticDir?: string,
) {
  const app = Fastify({ logger: true });

  await app.register(swagger, {
    openapi: { info: { title: 'Archimesh API', version: '0.0.0' } },
  });
  app.get(
    '/api/health',
    {
      schema: {
        response: {
          200: z.toJSONSchema(healthSchema),
          503: z.toJSONSchema(healthSchema),
        },
      },
    },
    async (_request, reply) => {
      try {
        await checkDatabase();
        return healthSchema.parse({ status: 'ok', database: 'connected' });
      } catch {
        return reply
          .code(503)
          .send(healthSchema.parse({ status: 'unavailable', database: 'unavailable' }));
      }
    },
  );
  app.get('/api/openapi.json', async () => app.swagger());
  if (staticDir) {
    await app.register(fastifyStatic, { root: staticDir });
  }
  return app;
}
