import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as oidc from 'openid-client';
import { describe, expect, test } from 'vitest';
import { oidcProvider } from './entra.js';

const tenant = 'ba4f6dc1-3beb-4bba-9d6f-0f64860ed9c7';
const clientId = '6eb65f80-8c96-4408-84be-d2d3ddeeb095';
const objectId = 'fc900323-7d4d-42da-bfc4-0baf59a5ef12';
const issuer = 'https://local-issuer.test/tenant/v2.0';
const redirect = 'https://workbench.test/api/auth/entra/callback';
const attempt = {
  state: 'single-use-state',
  nonce: 'single-use-nonce',
  verifier: 'a'.repeat(43),
};
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });

function fixture(
  overrides: Record<string, unknown> = {},
  validSignature = true,
) {
  const config = new oidc.Configuration(
    {
      issuer,
      authorization_endpoint: issuer + '/authorize',
      token_endpoint: issuer + '/token',
      jwks_uri: issuer + '/keys',
      id_token_signing_alg_values_supported: ['RS256'],
      response_types_supported: ['code'],
    },
    clientId,
    { id_token_signed_response_alg: 'RS256' },
    oidc.ClientSecretPost('fixture-client-secret'),
  );

  const clock = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    aud: clientId,
    sub: 'opaque-subject',
    tid: tenant,
    oid: objectId,
    iat: clock,
    exp: clock + 300,
    nonce: attempt.nonce,
    ...overrides,
  };
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned =
    encode({ alg: 'RS256', kid: 'fixture-key' }) + '.' + encode(payload);
  const key = validSignature ? keys.privateKey : foreign.privateKey;
  const signed =
    unsigned +
    '.' +
    sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');

  config[oidc.customFetch] = async (url, options) => {
    if (url === issuer + '/keys') {
      return Response.json({
        keys: [
          {
            ...keys.publicKey.export({ format: 'jwk' }),
            alg: 'RS256',
            kid: 'fixture-key',
          },
        ],
      });
    }
    if (url !== issuer + '/token')
      throw new Error('Unexpected fixture endpoint');
    const body = new URLSearchParams(String(options.body));
    expect(body.get('code_verifier')).toBe(attempt.verifier);
    expect(body.get('redirect_uri')).toBe(redirect);
    return Response.json({
      id_token: signed,
      access_token: 'fixture-access-token',
      token_type: 'Bearer',
    });
  };
  return oidcProvider(
    config,
    tenant,
    new Map([[objectId, 'contractor-procurement']]),
  );
}

function callback(state = attempt.state) {
  const url = new URL(redirect);
  url.searchParams.set('code', 'fixture-code');
  url.searchParams.set('state', state);
  return url;
}

describe('workbench OIDC provider', () => {
  test('requests authorization code with state, nonce and S256 PKCE', async () => {
    const url = await fixture().authorize(redirect, attempt);
    expect(url.origin).toBe('https://local-issuer.test');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256')
        .update(attempt.verifier)
        .digest('base64url'),
    });
  });
  test('maps a verified directory object to its server-assigned identity', async () => {
    await expect(fixture().verify(callback(), attempt)).resolves.toBe(
      'contractor-procurement',
    );
  });
  test('withholds identity for another tenant or an unmapped directory object', async () => {
    await expect(
      fixture({ tid: 'another-tenant' }).verify(callback(), attempt),
    ).resolves.toBeUndefined();
    await expect(
      fixture({ oid: 'unmapped' }).verify(callback(), attempt),
    ).resolves.toBeUndefined();
  });
  test.each([
    ['issuer', { iss: 'https://other-issuer.test' }],
    ['audience', { aud: 'another-client' }],
    ['nonce', { nonce: 'wrong-nonce' }],
    ['expiry', { exp: 1 }],
  ])('rejects a mismatched %s', async (_field, claims) => {
    await expect(fixture(claims).verify(callback(), attempt)).rejects.toThrow();
  });
  test('rejects an invalid token signature and callback state', async () => {
    await expect(
      fixture({}, false).verify(callback(), attempt),
    ).rejects.toThrow();
    await expect(
      fixture().verify(callback('wrong-state'), attempt),
    ).rejects.toThrow();
  });
});
