import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  identityHeader,
  identitySchema,
  type DemoIdentity,
} from '@archimesh/contracts';
import { z } from 'zod';
import { ModelError } from '../model/store.js';

const loopbackNames = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const sessionCookie = '__Host-archimesh-session';
const flowCookie = '__Host-archimesh-signin';
const sessionSeconds = 8 * 60 * 60;
const flowSeconds = 5 * 60;
const passwordInput = z
  .object({ password: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();

export interface BrowserAccess {
  modelSecurity: 'localDemo' | 'browserSession';
  requireIdentity: (request: FastifyRequest) => DemoIdentity;
  register: (app: FastifyInstance) => void;
}

export function loopbackAccess(enabled: boolean): BrowserAccess {
  function allowsDemo(request: FastifyRequest) {
    return (
      enabled &&
      process.env.NODE_ENV !== 'production' &&
      loopbackNames.has(request.hostname.toLowerCase()) &&
      loopbackAddresses.has(request.ip) &&
      request.headers['sec-fetch-site'] !== 'cross-site'
    );
  }

  return {
    modelSecurity: 'localDemo',
    requireIdentity(request) {
      if (!allowsDemo(request))
        throw new ModelError(403, 'Local demo access is unavailable');
      const identity = identitySchema.safeParse(
        request.headers[identityHeader],
      );
      if (!identity.success)
        throw new ModelError(401, 'Select a local demo identity');
      return identity.data;
    },
    register(app) {
      app.get('/api/auth/status', async (request, reply) => {
        reply.header('cache-control', 'no-store');
        return {
          mode: allowsDemo(request) ? 'demo' : 'disabled',
          identity: null,
        };
      });
    },
  };
}

export interface SignInAttempt {
  state: string;
  nonce: string;
  verifier: string;
}

export interface IdentityProvider {
  authorize: (redirect: string, attempt: SignInAttempt) => Promise<URL>;
  verify: (
    callback: URL,
    attempt: SignInAttempt,
  ) => Promise<DemoIdentity | undefined>;
}

type NetworkMode = {
  origin: URL;
  acceptsPeer?: (address: string) => boolean;
} & (
  | {
      mode: 'lan';
      passwordHash: Buffer;
    }
  | {
      mode: 'entra';
      provider: IdentityProvider;
    }
);

class ExpiringTokens<T> {
  private readonly entries = new Map<string, { value: T; until: number }>();

  constructor(private readonly maxAgeSeconds: number) {}

  issue(value: T) {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.until <= now) this.entries.delete(key);
    }
    if (this.entries.size >= 256)
      throw new ModelError(403, 'Sign-in capacity reached. Try again later.');
    const key = randomBytes(32).toString('base64url');
    this.entries.set(key, { value, until: now + this.maxAgeSeconds * 1000 });
    return key;
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.until > Date.now()) return entry.value;
    this.entries.delete(key);
  }

  delete(key: string) {
    this.entries.delete(key);
  }
}

function token(request: FastifyRequest, name: string) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const matches = cookies
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name + '='));
  const value =
    matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}

function cookie(name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}

export function networkAccess(options: NetworkMode): BrowserAccess {
  const sessions = new ExpiringTokens<DemoIdentity>(sessionSeconds);
  const flows = new ExpiringTokens<SignInAttempt>(flowSeconds);
  const callback = new URL('/api/auth/entra/callback', options.origin);
  const identity = (request: FastifyRequest) =>
    sessions.get(token(request, sessionCookie));

  function newSession(request: FastifyRequest, who: DemoIdentity) {
    sessions.delete(token(request, sessionCookie));
    return cookie(sessionCookie, sessions.issue(who), sessionSeconds);
  }

  return {
    modelSecurity: 'browserSession',
    requireIdentity(request) {
      if (request.headers['sec-fetch-site'] === 'cross-site')
        throw new ModelError(403, 'Cross-site request denied');
      const who = identity(request);
      if (!who) throw new ModelError(401, 'Sign in to access ArchiMesh');
      return who;
    },
    register(app) {
      app.addHook('onRequest', async (request, reply) => {
        if (
          request.protocol !== 'https' ||
          request.host.toLowerCase() !== options.origin.host.toLowerCase() ||
          (options.acceptsPeer && !options.acceptsPeer(request.ip))
        )
          return reply
            .code(403)
            .send({ message: 'This network address is unavailable' });
        if (
          request.method !== 'GET' &&
          request.method !== 'HEAD' &&
          request.headers.origin !== options.origin.origin
        )
          return reply
            .code(403)
            .send({ message: 'Cross-origin request denied' });
        if (request.url.startsWith('/api/')) {
          reply
            .header('cache-control', 'no-store')
            .header('referrer-policy', 'no-referrer');
        }
      });

      app.get('/api/auth/status', async (request) => ({
        mode: options.mode,
        identity: identity(request) ?? null,
      }));

      app.post('/api/auth/logout', async (request, reply) => {
        sessions.delete(token(request, sessionCookie));
        reply.header('set-cookie', cookie(sessionCookie, '', 0));
        return { mode: options.mode, identity: null };
      });

      if (options.mode === 'lan') {
        app.post(
          '/api/auth/login',
          { bodyLimit: 512 },
          async (request, reply) => {
            const payload = passwordInput.safeParse(request.body);
            const supplied = createHash('sha256')
              .update(payload.data?.password ?? '')
              .digest();
            if (!timingSafeEqual(supplied, options.passwordHash)) {
              return reply
                .code(401)
                .send({ message: 'Invalid access passphrase' });
            }
            try {
              reply.header('set-cookie', newSession(request, 'architect'));
              return { mode: options.mode, identity: 'architect' };
            } catch (error) {
              if (error instanceof ModelError)
                return reply
                  .code(error.status)
                  .send({ message: error.message });
              throw error;
            }
          },
        );
      } else {
        app.get('/api/auth/entra/start', async (request, reply) => {
          if (request.headers['sec-fetch-site'] === 'cross-site')
            return reply.code(403).send();
          try {
            const attempt = {
              state: randomBytes(32).toString('base64url'),
              nonce: randomBytes(32).toString('base64url'),
              verifier: randomBytes(32).toString('base64url'),
            };
            const url = await options.provider.authorize(
              callback.href,
              attempt,
            );
            flows.delete(token(request, flowCookie));
            reply.header(
              'set-cookie',
              cookie(flowCookie, flows.issue(attempt), flowSeconds),
            );
            return reply.redirect(url.href);
          } catch {
            return reply.redirect('/?signIn=failed');
          }
        });

        app.get('/api/auth/entra/callback', async (request, reply) => {
          const key = token(request, flowCookie);
          const attempt = flows.get(key);
          flows.delete(key);
          const clearFlow = cookie(flowCookie, '', 0);
          reply.header('set-cookie', clearFlow);
          if (!attempt) return reply.redirect('/?signIn=failed');

          const response = new URL(callback);
          const queryAt = request.url.indexOf('?');
          if (queryAt >= 0) response.search = request.url.slice(queryAt);
          try {
            const who = await options.provider.verify(response, attempt);
            if (!who) return reply.redirect('/?signIn=denied');
            reply.header('set-cookie', [clearFlow, newSession(request, who)]);
            return reply.redirect('/');
          } catch {
            return reply.redirect('/?signIn=failed');
          }
        });
      }
    },
  };
}
