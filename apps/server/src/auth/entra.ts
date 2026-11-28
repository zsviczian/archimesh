import * as oidc from 'openid-client';
import { identitySchema, type DemoIdentity } from '@archimesh/contracts';
import { z } from 'zod';
import type { IdentityProvider } from './access.js';

const settings = z.object({
  ARCHIMESH_ENTRA_TENANT_ID: z.uuid(),
  ARCHIMESH_ENTRA_CLIENT_ID: z.uuid(),
  ARCHIMESH_ENTRA_CLIENT_SECRET: z.string().min(1),
  ARCHIMESH_ENTRA_ACTORS: z.string().min(1),
});

export function oidcProvider(
  configuration: oidc.Configuration,
  tenantId: string,
  mappings: ReadonlyMap<string, DemoIdentity>,
): IdentityProvider {
  oidc.enableNonRepudiationChecks(configuration);
  return {
    async authorize(redirect, attempt) {
      return oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: redirect,
        scope: 'openid profile',
        response_type: 'code',
        state: attempt.state,
        nonce: attempt.nonce,
        code_challenge_method: 'S256',
        code_challenge: await oidc.calculatePKCECodeChallenge(attempt.verifier),
      });
    },
    async verify(callback, attempt) {
      const tokens = await oidc.authorizationCodeGrant(
        configuration,
        callback,
        {
          pkceCodeVerifier: attempt.verifier,
          expectedState: attempt.state,
          expectedNonce: attempt.nonce,
        },
      );
      const claims = tokens.claims();
      if (claims?.tid !== tenantId || typeof claims.oid !== 'string') return;
      return mappings.get(claims.oid.toLowerCase());
    },
  };
}

export async function entraProvider(env: NodeJS.ProcessEnv) {
  const parsed = settings.safeParse(env);
  if (!parsed.success)
    throw new Error(
      'Entra mode requires a tenant, client, client secret and actor mapping',
    );
  const tenant = parsed.data.ARCHIMESH_ENTRA_TENANT_ID.toLowerCase();
  let actorMap;
  try {
    actorMap = z
      .record(z.uuid(), identitySchema)
      .parse(JSON.parse(parsed.data.ARCHIMESH_ENTRA_ACTORS));
    const actors = Object.entries(actorMap);
    if (
      !actors.length ||
      new Set(actors.map(([key]) => key.toLowerCase())).size !==
        actors.length ||
      new Set(actors.map(([, actor]) => actor)).size !== actors.length
    )
      throw new Error();
  } catch {
    throw new Error(
      'Entra actor mapping must pair unique directory object IDs with distinct ArchiMesh identities',
    );
  }
  const authority = new URL(`https://login.microsoftonline.com/${tenant}/v2.0`);
  const configuration = await oidc.discovery(
    authority,
    parsed.data.ARCHIMESH_ENTRA_CLIENT_ID,
    { id_token_signed_response_alg: 'RS256' },
    oidc.ClientSecretPost(parsed.data.ARCHIMESH_ENTRA_CLIENT_SECRET),
  );
  return oidcProvider(
    configuration,
    tenant,
    new Map(
      Object.entries(actorMap).map(([key, actor]) => [
        key.toLowerCase(),
        actor,
      ]),
    ),
  );
}
