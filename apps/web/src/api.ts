import {
  browserAuthSchema,
  changesetResultSchema,
  healthSchema,
  identityHeader,
  metamodelSchema,
  modelObjectSchema,
  neighborhoodSchema,
  objectListSchema,
  revisionSchema,
  scenarioDetailSchema,
  scenarioListSchema,
  sessionSchema,
  type Changeset,
  type DemoIdentity,
  type ModelView,
} from '@archimesh/contracts';

type Schema<T> = { parse(input: unknown): T };
type RequestConfig = {
  identity?: DemoIdentity;
  signal?: AbortSignal;
  method?: 'POST' | 'PATCH';
  body?: unknown;
};

export const modelKey = (identity: DemoIdentity) =>
  ['model', identity] as const;
export const objectKey = (
  identity: DemoIdentity,
  id: string,
  revision?: string,
) => [...modelKey(identity), 'object', id, revision ?? 'current'] as const;
export const neighborhoodKey = (identity: DemoIdentity, id: string) =>
  [...modelKey(identity), 'neighborhood', id] as const;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(status: number, data: unknown): string {
  if (status === 401) return 'Sign in or choose an available identity.';
  if (status === 403 || status === 404)
    return 'This object or action is unavailable.';
  if (status === 409)
    return 'This revision changed. Close the editor and reopen the latest version before saving.';
  if (status >= 500)
    return 'The repository is unavailable. Check the local server and PostgreSQL.';
  if (
    data &&
    typeof data === 'object' &&
    'message' in data &&
    typeof data.message === 'string'
  ) {
    return data.message.slice(0, 600);
  }
  return 'The repository could not accept this request.';
}

async function request<T>(
  path: string,
  schema: Schema<T>,
  config: RequestConfig = {},
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (config.identity) headers.set(identityHeader, config.identity);
  if (config.body !== undefined)
    headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    headers,
    cache: 'no-store',
    method: config.method ?? 'GET',
    body: config.body === undefined ? undefined : JSON.stringify(config.body),
    signal: config.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(response.status, errorMessage(response.status, data));
  return schema.parse(data);
}

export const browserAuthKey = ['browser-auth'] as const;

export function browserAuth(signal: AbortSignal) {
  return request('/api/auth/status', browserAuthSchema, { signal });
}

export function signInWithPassphrase(password: string) {
  return request('/api/auth/login', browserAuthSchema, {
    method: 'POST',
    body: { password },
  });
}

export function signOut() {
  return request('/api/auth/logout', browserAuthSchema, { method: 'POST' });
}

export function health(signal: AbortSignal) {
  return request('/api/health', healthSchema, { signal });
}

export function session(identity: DemoIdentity, signal: AbortSignal) {
  return request('/api/model/session', sessionSchema, { identity, signal });
}

export function metamodel(identity: DemoIdentity, signal: AbortSignal) {
  return request('/api/model/metamodel', metamodelSchema, { identity, signal });
}

export const pageSize = 20;
export type CatalogFilters = { q: string; type: string; scopeId: string };

export function listObjects(
  identity: DemoIdentity,
  filters: CatalogFilters,
  cursor: string | undefined,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ limit: String(pageSize) });
  for (const key of ['q', 'type', 'scopeId'] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  if (cursor) query.set('cursor', cursor);
  return request(`/api/model/objects?${query}`, objectListSchema, {
    identity,
    signal,
  });
}

function objectEndpoint(id: string) {
  return `/api/model/objects/${encodeURIComponent(id)}`;
}

export function getObject(
  identity: DemoIdentity,
  id: string,
  revision: string | undefined,
  signal: AbortSignal,
) {
  const search = revision ? `?${new URLSearchParams({ revision })}` : '';
  return request(objectEndpoint(id) + search, modelObjectSchema, {
    identity,
    signal,
  });
}

export async function getViewObjects(
  identity: DemoIdentity,
  view: ModelView,
  signal: AbortSignal,
) {
  const ids = [...new Set([...view.objectIds, ...view.relationshipIds])];
  const objects = [];
  for (let offset = 0; offset < ids.length; offset += 8) {
    const batch = await Promise.all(
      ids.slice(offset, offset + 8).map(async (id) => {
        try {
          return await getObject(identity, id, undefined, signal);
        } catch (error) {
          if (
            error instanceof ApiError &&
            (error.status === 403 || error.status === 404)
          )
            return null;
          throw error;
        }
      }),
    );
    objects.push(...batch.filter((object) => object !== null));
  }
  return objects;
}

const historySchema = {
  parse(data: unknown) {
    if (
      !data ||
      typeof data !== 'object' ||
      !('items' in data) ||
      !Array.isArray(data.items)
    ) {
      throw new Error('Unexpected revision history response');
    }
    return data.items.map((item: unknown) => revisionSchema.parse(item));
  },
};

export function history(
  identity: DemoIdentity,
  id: string,
  signal: AbortSignal,
) {
  return request(`${objectEndpoint(id)}/history`, historySchema, {
    identity,
    signal,
  });
}

export function neighborhood(
  identity: DemoIdentity,
  id: string,
  signal: AbortSignal,
) {
  return request(`${objectEndpoint(id)}/neighborhood`, neighborhoodSchema, {
    identity,
    signal,
  });
}

export function applyChangeset(identity: DemoIdentity, body: Changeset) {
  return request('/api/model/changesets', changesetResultSchema, {
    identity,
    method: 'POST',
    body,
  });
}

const validationSchema = {
  parse(data: unknown): { valid: boolean; issues: string[] } {
    if (
      !data ||
      typeof data !== 'object' ||
      !('valid' in data) ||
      typeof data.valid !== 'boolean' ||
      !('issues' in data) ||
      !Array.isArray(data.issues) ||
      !data.issues.every((issue) => typeof issue === 'string')
    ) {
      throw new Error('Unexpected validation response');
    }
    return { valid: data.valid, issues: data.issues };
  },
};

export function validateChangeset(identity: DemoIdentity, body: Changeset) {
  return request('/api/model/validate', validationSchema, {
    identity,
    method: 'POST',
    body,
  });
}

export function updateLayout(
  identity: DemoIdentity,
  id: string,
  body: {
    requestId: string;
    expectedRevisionId: string;
    positions: ModelView['positions'];
  },
) {
  return request(
    `/api/model/views/${encodeURIComponent(id)}/layout`,
    changesetResultSchema,
    { identity, method: 'PATCH', body },
  );
}

export async function listScenarios(
  identity: DemoIdentity,
  signal: AbortSignal,
) {
  return (
    await request('/api/model/scenarios', scenarioListSchema, {
      identity,
      signal,
    })
  ).items;
}

export function getScenario(
  identity: DemoIdentity,
  id: string,
  signal: AbortSignal,
) {
  return request(
    `/api/model/scenarios/${encodeURIComponent(id)}`,
    scenarioDetailSchema,
    { identity, signal },
  );
}
