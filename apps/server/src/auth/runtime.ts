import { readFile } from 'node:fs/promises';
import type { ServerOptions } from 'node:https';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import { loopbackAccess, networkAccess, type BrowserAccess } from './access.js';
import { entraProvider } from './entra.js';

interface Runtime {
  host: string;
  port: number;
  access: BrowserAccess;
  tls?: ServerOptions;
  serveWeb: boolean;
}

export function privateIpv4(ip: string) {
  if (!isIPv4(ip)) return false;
  const [first, second] = ip.split('.').map(Number);
  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function ipNumber(ip: string) {
  return ip
    .split('.')
    .reduce((value, octet) => (value << 8) | Number(octet), 0);
}

function lanPeers(host: string) {
  const local = Object.values(networkInterfaces())
    .flat()
    .find(
      (address) => address && address.address === host && !address.internal,
    );
  if (!local || !privateIpv4(host))
    throw new Error(
      'LAN mode requires a private IPv4 currently assigned to this machine',
    );
  const mask = ipNumber(local.netmask);
  const subnet = ipNumber(host) & mask;
  return (remote: string) => {
    const ip = remote.replace(/^::ffff:/, '');
    return privateIpv4(ip) && (ipNumber(ip) & mask) === subnet;
  };
}

async function tlsFiles(
  certFile: string | URL,
  keyFile: string | URL,
): Promise<ServerOptions> {
  const [cert, key] = await Promise.all([
    readFile(certFile),
    readFile(keyFile),
  ]);
  return { cert, key, minVersion: 'TLSv1.2' };
}

const configSchema = z
  .object({
    host: z.string(),
    port: z.number().int().min(1024).max(65535),
    passwordHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export async function serverRuntime(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
): Promise<Runtime> {
  const localLan = args.includes('--lan');
  const isProduction = env.NODE_ENV === 'production';
  const host = env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1');
  if (localLan) {
    if (isProduction || env.ARCHIMESH_AUTH_MODE === 'entra')
      throw new Error(
        'LAN demo must run separately from deployed authentication',
      );
    const folder = new URL('../../../../.local/lan/', import.meta.url);
    const config = configSchema.parse(
      JSON.parse(await readFile(new URL('config.json', folder), 'utf8')),
    );
    const acceptsPeer = lanPeers(config.host);
    return {
      host: config.host,
      port: config.port,
      serveWeb: true,
      tls: await tlsFiles(
        new URL('server-cert.pem', folder),
        new URL('server-key.pem', folder),
      ),
      access: networkAccess({
        mode: 'lan',
        origin: new URL(`https://${config.host}:${config.port}`),
        acceptsPeer,
        passwordHash: Buffer.from(config.passwordHash, 'hex'),
      }),
    };
  }

  if (env.ARCHIMESH_AUTH_MODE === 'entra') {
    const origin = new URL(env.ARCHIMESH_ORIGIN ?? '');
    const certFile = env.ARCHIMESH_HTTPS_CERT_FILE;
    const keyFile = env.ARCHIMESH_HTTPS_KEY_FILE;
    if (
      origin.protocol !== 'https:' ||
      origin.pathname !== '/' ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      !certFile ||
      !keyFile
    ) {
      throw new Error(
        'Entra mode requires an HTTPS origin, certificate and key',
      );
    }
    return {
      host,
      port: Number(env.PORT ?? (origin.port || 443)),
      serveWeb: true,
      tls: await tlsFiles(certFile, keyFile),
      access: networkAccess({
        mode: 'entra',
        origin,
        provider: await entraProvider(env),
      }),
    };
  }

  if (env.ARCHIMESH_AUTH_MODE) throw new Error('Unknown ARCHIMESH_AUTH_MODE');
  const demo =
    !isProduction &&
    ['127.0.0.1', 'localhost', '::1'].includes(host) &&
    (args.includes('--local-demo') || env.ARCHIMESH_DEV_AUTH === '1');
  return {
    host,
    port: Number(env.PORT ?? 3000),
    access: loopbackAccess(demo),
    serveWeb: false,
  };
}
