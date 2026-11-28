import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, expect, test } from 'vitest';
import { ModelError } from '../model/store.js';
import {
  networkAccess,
  type BrowserAccess,
  type SignInAttempt,
} from './access.js';

const origin = new URL('https://workbench.test');
const sameOrigin = { host: origin.host, origin: origin.origin };
const passphrase = 'fixture-only'.padEnd(43, 'x');
let app: FastifyInstance | undefined;

function createTestApp(access: BrowserAccess) {
  const server = Fastify();
  server.addHook('onRequest', async (request) => {
    Object.assign(request.raw.socket, { encrypted: true });
  });
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ModelError)
      return reply.code(error.status).send({ message: error.message });
    throw error;
  });
  access.register(server);
  server.get('/model', async (request) => ({
    identity: access.requireIdentity(request),
  }));
  app = server;
  return server;
}

afterEach(async () => app?.close());

function sessionFrom(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value.join('; ') : String(value)).match(
    /__Host-archimesh-session=[A-Za-z0-9_-]{43}/,
  )?.[0];
}

test('LAN trusts the server session, constrains writes to its origin and revokes sign-out', async () => {
  const server = createTestApp(
    networkAccess({
      origin,
      mode: 'lan',
      acceptsPeer: (peer) => peer === '127.0.0.1',
      passwordHash: createHash('sha256').update(passphrase).digest(),
    }),
  );

  const anon = await server.inject({
    url: '/model',
    headers: { host: origin.host, 'x-archimesh-identity': 'architect' },
  });
  expect(anon.statusCode).toBe(401);
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { ...sameOrigin, origin: 'https://foreign.test' },
        payload: { password: passphrase },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: sameOrigin,
        payload: { password: 'wrong' },
      })
    ).statusCode,
  ).toBe(401);

  const login = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: sameOrigin,
    payload: { password: passphrase },
  });
  expect(login.statusCode).toBe(200);
  expect(String(login.headers['set-cookie'])).toContain(
    '; Path=/; Secure; HttpOnly; SameSite=Lax;',
  );
  const session = sessionFrom(login);
  expect(session).toBeDefined();

  const headers = {
    ...sameOrigin,
    cookie: session,
    'x-archimesh-identity': 'contractor-integration',
  };
  expect((await server.inject({ url: '/model', headers })).json()).toEqual({
    identity: 'architect',
  });
  expect(
    (
      await server.inject({
        url: '/model',
        headers,
        remoteAddress: '192.0.2.2',
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await server.inject({
        url: '/model',
        headers: { ...headers, host: 'foreign.test' },
      })
    ).statusCode,
  ).toBe(403);
  await server.inject({ method: 'POST', url: '/api/auth/logout', headers });
  expect((await server.inject({ url: '/model', headers })).statusCode).toBe(
    401,
  );
});

test('Entra callback requires the flow cookie and consumes the attempt once', async () => {
  let flow: SignInAttempt | undefined;
  const server = createTestApp(
    networkAccess({
      mode: 'entra',
      origin,
      provider: {
        authorize: async (redirect, attempt) => {
          flow = attempt;
          expect(redirect).toBe(origin.origin + '/api/auth/entra/callback');
          const url = new URL('https://local-issuer.test/authorize');
          url.searchParams.set('state', attempt.state);
          return url;
        },
        verify: async (callback, attempt) => {
          expect(attempt).toEqual(flow);
          if (callback.searchParams.get('state') === attempt.state)
            return 'contractor-procurement';
        },
      },
    }),
  );
  const start = await server.inject({
    url: '/api/auth/entra/start',
    headers: { host: origin.host },
  });
  expect(start.statusCode).toBe(302);
  expect(start.headers.location).toMatch(
    /^https:\/\/local-issuer\.test\/authorize\?state=/,
  );
  const flowToken = String(start.headers['set-cookie']).match(
    /__Host-archimesh-signin=[A-Za-z0-9_-]{43}/,
  )?.[0];
  expect(flowToken).toBeDefined();
  const callback = `/api/auth/entra/callback?code=example&state=${flow?.state}`;
  expect(
    sessionFrom(
      await server.inject({ url: callback, headers: { host: origin.host } }),
    ),
  ).toBeUndefined();

  const signedIn = await server.inject({
    url: callback,
    headers: { host: origin.host, cookie: flowToken },
  });
  expect(signedIn.headers.location).toBe('/');
  const session = sessionFrom(signedIn);
  expect(session).toBeDefined();
  expect(
    (
      await server.inject({
        url: '/model',
        headers: { host: origin.host, cookie: session },
      })
    ).json(),
  ).toEqual({ identity: 'contractor-procurement' });

  const replay = await server.inject({
    url: callback,
    headers: { host: origin.host, cookie: flowToken },
  });
  expect(replay.headers.location).toBe('/?signIn=failed');
  expect(sessionFrom(replay)).toBeUndefined();
});
