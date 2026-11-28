import type { BrowserAccess } from '../auth/access.js';
import {
  exportBundle,
  exportFilter,
  importBundle,
  importRequest,
} from './interchange.js';
import {
  createScenario,
  getScenario,
  listScenarios,
  scenarioRequest,
} from './scenarios.js';
import { findProviders } from './providers.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  changesetSchema,
  changesetResultSchema,
  bundleSchema,
  sessionSchema,
  metamodelSchema,
  objectListSchema,
  modelObjectSchema,
  historySchema,
  neighborhoodSchema,
  providerResultSchema,
  scenarioListSchema,
  scenarioDetailSchema,
  scenarioSummarySchema,
  validationResultSchema,
  positionSchema,
  uuidSchema,
} from '@archimesh/contracts';
import { metamodel } from '@archimesh/core';
import { commitChangeset, saveLayout, validateChangeset } from './commands.js';
import {
  getHistory,
  getNeighborhood,
  getObject,
  getSession,
  listObjects,
  listQuery,
} from './queries.js';
import { ModelError, type Db } from './store.js';

const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'draft-7' });

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ModelError(400, 'Invalid model request');
  return result.data;
}

const objectParams = z.object({ id: uuidSchema });
const revisionQuery = z.object({ revision: uuidSchema.optional() });
const neighborhoodQuery = z.object({
  direction: z.enum(['inbound', 'outbound', 'both']).default('both'),
});
const layoutSchema = z
  .object({
    expectedRevisionId: uuidSchema,
    requestId: uuidSchema,
    positions: z.record(uuidSchema, positionSchema),
  })
  .strict()
  .refine((layout) => Object.keys(layout.positions).length <= 80);

function handleModelError(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ModelError) {
    return reply.code(error.status).send({ message: error.message });
  }
  if ('code' in error && (error.code === '23505' || error.code === '23503')) {
    return reply
      .code(409)
      .send({ message: 'This change conflicts with the current model' });
  }
  if (
    'statusCode' in error &&
    (error.statusCode === 400 ||
      error.statusCode === 413 ||
      error.statusCode === 415)
  ) {
    return reply
      .code(error.statusCode)
      .send({ message: 'Invalid model request' });
  }
  request.log.error(
    { code: 'code' in error ? error.code : 'model-error' },
    'Model request failed',
  );
  return reply
    .code(500)
    .send({ message: 'The model request could not be completed' });
}

export async function registerModelRoutes(
  app: FastifyInstance,
  db: Db,
  access: BrowserAccess,
) {
  await app.register(
    async (api) => {
      api.addHook('onRequest', async (request, reply) => {
        reply.header('cache-control', 'no-store');
        access.requireIdentity(request);
      });
      api.setErrorHandler(handleModelError);

      api.get(
        '/session',
        {
          schema: {
            summary: 'Get the active identity and accessible scopes',
            response: { 200: jsonSchema(sessionSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request) => getSession(db, access.requireIdentity(request)),
      );

      api.get(
        '/metamodel',
        {
          schema: {
            summary: 'Get the supported object and relationship types',
            response: { 200: jsonSchema(metamodelSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async () => metamodel,
      );

      api.get(
        '/objects',
        {
          schema: {
            summary: 'Search accessible current or historical objects',
            querystring: jsonSchema(listQuery),
            response: { 200: jsonSchema(objectListSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request) =>
          listObjects(
            db,
            access.requireIdentity(request),
            input(listQuery, request.query),
          ),
      );

      api.get(
        '/objects/:id',
        {
          schema: {
            summary: 'Read an identified object and its Markdown',
            params: jsonSchema(objectParams),
            querystring: jsonSchema(revisionQuery),
            response: { 200: jsonSchema(modelObjectSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request) => {
          const { id } = input(objectParams, request.params);
          const { revision } = input(revisionQuery, request.query);
          return getObject(db, access.requireIdentity(request), id, revision);
        },
      );

      api.get(
        '/objects/:id/history',
        {
          schema: {
            summary: 'List an accessible object’s recorded revisions',
            params: jsonSchema(objectParams),
            response: { 200: jsonSchema(historySchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request) => {
          const { id } = input(objectParams, request.params);
          return getHistory(db, access.requireIdentity(request), id);
        },
      );

      api.get(
        '/objects/:id/neighborhood',
        {
          schema: {
            summary: 'Explore the bounded semantic neighborhood',
            params: jsonSchema(objectParams),
            querystring: jsonSchema(neighborhoodQuery),
            response: { 200: jsonSchema(neighborhoodSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request) => {
          const { id } = input(objectParams, request.params);
          const { direction } = input(neighborhoodQuery, request.query);
          return getNeighborhood(
            db,
            access.requireIdentity(request),
            id,
            direction,
          );
        },
      );

      api.post(
        '/changesets',
        {
          schema: {
            summary: 'Commit atomic changes under optimistic concurrency',
            body: jsonSchema(changesetSchema),
            response: { 201: jsonSchema(changesetResultSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request, reply) => {
          const result = await commitChangeset(
            db,
            access.requireIdentity(request),
            input(changesetSchema, request.body),
          );
          return reply.code(201).send(result);
        },
      );

      api.post(
        '/validate',
        {
          schema: {
            summary: 'Validate a draft changeset without saving it',
            body: jsonSchema(changesetSchema),
            response: { 200: jsonSchema(validationResultSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Model'],
          },
        },
        async (request) => {
          const change = input(changesetSchema, request.body);
          try {
            await validateChangeset(
              db,
              access.requireIdentity(request),
              change,
            );
            return { valid: true, issues: [] };
          } catch (error) {
            if (
              error instanceof ModelError &&
              (error.status === 422 || error.status === 409)
            ) {
              return { valid: false, issues: [error.message] };
            }
            throw error;
          }
        },
      );

      api.get(
        '/providers/:id',
        {
          schema: {
            summary: 'Find accessible providers for a capability',
            params: jsonSchema(objectParams),
            response: { 200: jsonSchema(providerResultSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Reuse'],
          },
        },
        async (request) => {
          const { id } = input(objectParams, request.params);
          return findProviders(db, access.requireIdentity(request), id);
        },
      );

      api.get(
        '/bundle',
        {
          schema: {
            summary: 'Export an authorized revision-pinned OKF bundle',
            querystring: jsonSchema(exportFilter),
            response: { 200: jsonSchema(bundleSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Interchange'],
          },
        },
        async (request) =>
          exportBundle(
            db,
            access.requireIdentity(request),
            input(exportFilter, request.query),
          ),
      );

      api.post(
        '/bundles/import',
        {
          schema: {
            summary: 'Import new OKF objects atomically',
            body: jsonSchema(importRequest),
            response: { 201: jsonSchema(changesetResultSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Interchange'],
          },
        },
        async (request, reply) => {
          const result = await importBundle(
            db,
            access.requireIdentity(request),
            input(importRequest, request.body),
          );
          return reply.code(201).send(result);
        },
      );

      api.get(
        '/scenarios',
        {
          schema: {
            summary: 'List accessible draft scenarios',
            response: { 200: jsonSchema(scenarioListSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Scenarios'],
          },
        },
        async (request) => listScenarios(db, access.requireIdentity(request)),
      );

      api.get(
        '/scenarios/:id',
        {
          schema: {
            summary: 'Read a pinned scenario and proposed semantic differences',
            params: jsonSchema(objectParams),
            response: { 200: jsonSchema(scenarioDetailSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Scenarios'],
          },
        },
        async (request) => {
          const { id } = input(objectParams, request.params);
          return getScenario(db, access.requireIdentity(request), id);
        },
      );

      api.post(
        '/scenarios',
        {
          schema: {
            summary: 'Save a proposal without modifying the actual model',
            body: jsonSchema(scenarioRequest),
            response: { 201: jsonSchema(scenarioSummarySchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Scenarios'],
          },
        },
        async (request, reply) => {
          const scenario = await createScenario(
            db,
            access.requireIdentity(request),
            input(scenarioRequest, request.body),
          );
          return reply.code(201).send(scenario);
        },
      );

      api.patch(
        '/views/:id/layout',
        {
          schema: {
            summary: 'Save visual positions without editing semantic objects',
            params: jsonSchema(objectParams),
            body: jsonSchema(layoutSchema),
            response: { 200: jsonSchema(changesetResultSchema) },
            security: [{ [access.modelSecurity]: [] }],
            tags: ['Views'],
          },
        },
        async (request) => {
          const { id } = input(objectParams, request.params);
          const { expectedRevisionId, positions, requestId } = input(
            layoutSchema,
            request.body,
          );
          return saveLayout(
            db,
            access.requireIdentity(request),
            id,
            expectedRevisionId,
            requestId,
            positions,
          );
        },
      );
    },
    { prefix: '/api/model' },
  );
}
