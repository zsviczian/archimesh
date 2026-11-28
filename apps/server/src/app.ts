import type { ServerOptions } from 'node:https';
import { loopbackAccess, type BrowserAccess } from './auth/access.js';
import { registerModelRoutes } from './model/routes.js';
import type { Db } from './model/store.js';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import fastifyStatic from '@fastify/static';
import {
  healthSchema,
  identityHeader,
  maxModelPayloadBytes,
} from '@archimesh/contracts';
import { z } from 'zod';

export async function createApp(
  checkDatabase: () => Promise<void>,
  staticDir?: string,
  model?: { db: Db; localDemo: boolean; access?: BrowserAccess },
  tls?: ServerOptions,
) {
  const app = Fastify({
    logger: {
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url?.split('?', 1)[0],
        }),
      },
    },
    ...(tls ? { https: tls } : {}),
    bodyLimit: maxModelPayloadBytes,
    ajv: { customOptions: { removeAdditional: false } },
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'ArchiMesh API', version: '0.1.0' },
      components: {
        securitySchemes: {
          localDemo: { type: 'apiKey', in: 'header', name: identityHeader },
          browserSession: {
            type: 'apiKey',
            in: 'cookie',
            name: '__Host-archimesh-session',
          },
        },
      },
    },
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
        return reply.code(503).send(
          healthSchema.parse({
            status: 'unavailable',
            database: 'unavailable',
          }),
        );
      }
    },
  );
  app.get('/api/openapi.json', async () => app.swagger());
  const access = model?.access ?? loopbackAccess(model?.localDemo ?? false);
  access.register(app);
  if (model) await registerModelRoutes(app, model.db, access);
  if (staticDir) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0];
      if (
        request.method === 'GET' &&
        /^\/(?:objects\/[0-9a-f-]{36}|scenarios(?:\/[0-9a-f-]{36})?)$/i.test(
          path ?? '',
        )
      ) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ message: 'Resource unavailable' });
    });
  }
  return app;
}
