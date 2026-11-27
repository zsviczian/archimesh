import {
  bundleSchema,
  changesetSchema,
  identityHeader,
  identitySchema,
  maxModelPayloadBytes,
  metamodelSchema,
  modelObjectSchema,
  modelSummarySchema,
  neighborhoodSchema,
  objectListSchema,
  scopeSchema,
  uuidSchema,
} from '@archimesh/contracts';
import { z } from 'zod';

export const maxPayloadBytes = maxModelPayloadBytes;
const scopeId = scopeSchema.shape.id;

export const searchInput = z.strictObject({
  q: z.string().trim().max(120).optional(),
  type: scopeId.optional(),
  scopeId: scopeId.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: uuidSchema.optional(),
});
export const objectInput = z.strictObject({
  id: uuidSchema,
  revision: uuidSchema.optional(),
});
export const neighborhoodInput = z.strictObject({
  id: uuidSchema,
  direction: z.enum(['inbound', 'outbound', 'both']).default('both'),
});
export const providerInput = z.strictObject({ id: uuidSchema });
export const draftInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  scopeId,
  operations: changesetSchema.shape.operations,
});
export const exportInput = z.strictObject({
  scopeId: scopeId.optional(),
  type: scopeId.optional(),
  recordedAt: z.iso.datetime().optional(),
  effectiveOn: z.iso.date().optional(),
});

const providerResult = z.object({
  capability: modelSummarySchema,
  providers: z
    .array(
      z.object({
        object: modelSummarySchema,
        relationship: modelSummarySchema,
      }),
    )
    .max(100),
  partial: z.boolean(),
});
const validationResult = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()),
});
const draftResult = z.object({
  id: uuidSchema,
  name: z.string(),
  scopeId,
  baseRecordedAt: z.iso.datetime(),
});

export class ModelClientError extends Error {}

function localApiOrigin(env: NodeJS.ProcessEnv): string {
  const port = env.PORT ?? '3000';
  let url: URL;
  try {
    url = new URL(env.ARCHIMESH_API_URL ?? 'http://127.0.0.1:' + port);
  } catch {
    throw new ModelClientError(
      'Set ARCHIMESH_API_URL to a valid loopback HTTP origin.',
    );
  }

  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    !['/', '/api/model', '/api/model/'].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new ModelClientError(
      'Use a numeric loopback HTTP origin in ARCHIMESH_API_URL.',
    );
  }
  return url.origin;
}

function requestError(status: number): ModelClientError {
  switch (status) {
    case 400:
      return new ModelClientError(
        'The model API rejected the request parameters.',
      );
    case 401:
      return new ModelClientError(
        'The model API did not accept the selected demo identity.',
      );
    case 403:
      return new ModelClientError(
        'This operation is unavailable to the selected demo identity.',
      );
    case 404:
      return new ModelClientError(
        'The model object or operation is unavailable.',
      );
    case 409:
      return new ModelClientError(
        'The request conflicts with the current model.',
      );
    case 413:
      return new ModelClientError(
        'The request exceeds the model API size limit.',
      );
    case 422:
      return new ModelClientError('Model validation rejected the request.');
    default:
      return new ModelClientError(
        'The model API could not complete the request.',
      );
  }
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new ModelClientError('The model API returned an empty response.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let byteLength = 0;
  let body = '';
  try {
    for (;;) {
      const data = await reader.read();
      if (data.done) break;
      byteLength += data.value.byteLength;
      if (byteLength > maxPayloadBytes) {
        throw new ModelClientError(
          'Result exceeds 1 MiB. Narrow filters or reduce the page size.',
        );
      }
      body += decoder.decode(data.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof ModelClientError) throw error;
    throw new ModelClientError(
      'The model API returned an unreadable response.',
    );
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createModelClient(env: NodeJS.ProcessEnv) {
  const identity = identitySchema.safeParse(env.ARCHIMESH_IDENTITY);
  if (!identity.success) {
    throw new ModelClientError(
      'Set ARCHIMESH_IDENTITY to architect, contractor-procurement, or contractor-integration.',
    );
  }
  const actor = identity.data;
  const origin = localApiOrigin(env);

  async function request<T>(
    path: string,
    output: z.ZodType<T>,
    query: Record<string, string | number | undefined> = {},
    data?: unknown,
  ): Promise<T> {
    const url = new URL('/api/model' + path, origin);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const body = data === undefined ? undefined : JSON.stringify(data);
    if (body && Buffer.byteLength(body) > maxPayloadBytes) {
      throw new ModelClientError(
        'The request exceeds 1 MiB. Split it into smaller requests.',
      );
    }
    const headers = { [identityHeader]: actor, accept: 'application/json' };
    let response: Response;
    try {
      response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        headers:
          body === undefined
            ? headers
            : { ...headers, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ModelClientError(
        'Could not reach the local model API. Check that it is running on the configured port.',
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw requestError(response.status);
    }
    const result = output.safeParse(await readJson(response));
    if (!result.success)
      throw new ModelClientError(
        'The model API response has an unexpected shape.',
      );
    return result.data;
  }

  return {
    search: (query: z.infer<typeof searchInput>) =>
      request('/objects', objectListSchema, query),
    object: ({ id, revision }: z.infer<typeof objectInput>) =>
      request('/objects/' + uuidSchema.parse(id), modelObjectSchema, {
        revision,
      }),
    neighborhood: ({ id, direction }: z.infer<typeof neighborhoodInput>) =>
      request(
        '/objects/' + uuidSchema.parse(id) + '/neighborhood',
        neighborhoodSchema,
        { direction },
      ),
    metamodel: () => request('/metamodel', metamodelSchema),
    providers: ({ id }: z.infer<typeof providerInput>) =>
      request('/providers/' + uuidSchema.parse(id), providerResult),
    validate: (change: z.infer<typeof changesetSchema>) =>
      request('/validate', validationResult, {}, change),
    draft: (change: z.infer<typeof draftInput>) =>
      request('/scenarios', draftResult, {}, change),
    exportContext: (query: z.infer<typeof exportInput>) =>
      request('/bundle', bundleSchema, query),
  };
}

export type ModelClient = ReturnType<typeof createModelClient>;

export function toolError(error: unknown): string {
  return error instanceof ModelClientError
    ? error.message
    : 'The tool could not complete the request.';
}
