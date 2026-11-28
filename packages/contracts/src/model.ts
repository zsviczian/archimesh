import { z } from 'zod';

export const maxModelPayloadBytes = 1024 * 1024;
export const identityHeader = 'x-archimesh-identity';
export const demoIdentities = [
  'architect',
  'contractor-procurement',
  'contractor-integration',
] as const;
export const identitySchema = z.enum(demoIdentities);
export const browserAuthSchema = z.object({
  mode: z.enum(['demo', 'lan', 'entra', 'disabled']),
  identity: identitySchema.nullable(),
});
export type BrowserAuthStatus = z.infer<typeof browserAuthSchema>;

export const uuidSchema = z.uuid();
const keySchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const markdownSchema = z
  .string()
  .min(1)
  .max(64 * 1024);
export const scopeSchema = z.object({
  id: keySchema,
  label: z.string(),
  writable: z.boolean(),
});
export const sessionSchema = z.object({
  identity: identitySchema,
  scopes: z.array(scopeSchema),
});
export const relationshipSchema = z.object({
  type: keySchema,
  sourceId: uuidSchema,
  targetId: uuidSchema,
});
export const positionSchema = z.object({
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
});
export const viewpointSchema = z.enum([
  'solution-context',
  'business-object-map',
]);
export const viewSchema = z.object({
  viewpoint: viewpointSchema,
  objectIds: z.array(uuidSchema).max(80),
  relationshipIds: z.array(uuidSchema).max(120),
  positions: z.record(uuidSchema, positionSchema),
});
export const modelSummarySchema = z.object({
  id: uuidSchema,
  scopeId: keySchema,
  type: keySchema,
  title: z.string(),
  description: z.string(),
  aliases: z.array(z.string()),
  lifecycle: z.string(),
  owner: z.string().nullable(),
  relationship: relationshipSchema.nullable(),
  revisionId: uuidSchema,
  updatedAt: z.iso.datetime(),
  retired: z.boolean(),
});
export const modelObjectSchema = modelSummarySchema.extend({
  markdown: markdownSchema,
  body: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  view: viewSchema.nullable(),
});
export const objectListSchema = z.object({
  items: z.array(modelSummarySchema),
  nextCursor: z.string().nullable(),
});
export const revisionSchema = z.object({
  id: uuidSchema,
  commitId: uuidSchema,
  recordedAt: z.iso.datetime(),
  actor: z.string(),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().nullable(),
  retired: z.boolean(),
});
export const neighborhoodSchema = z.object({
  nodes: z.array(modelSummarySchema),
  edges: z.array(modelSummarySchema),
  partial: z.boolean(),
});
export const metamodelSchema = z.object({
  version: z.string(),
  entityTypes: z.array(z.object({ id: keySchema, label: z.string() })),
  relationshipTypes: z.array(
    z.object({
      id: keySchema,
      label: z.string(),
      sourceTypes: z.array(keySchema),
      targetTypes: z.array(keySchema),
    }),
  ),
});
export const operationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('create'),
      scopeId: keySchema,
      markdown: markdownSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('update'),
      id: uuidSchema,
      expectedRevisionId: uuidSchema,
      markdown: markdownSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('retire'),
      id: uuidSchema,
      expectedRevisionId: uuidSchema,
    })
    .strict(),
]);
export const changesetSchema = z
  .object({
    requestId: uuidSchema,
    operations: z.array(operationSchema).min(1).max(128),
  })
  .strict();
export const changesetResultSchema = z.object({
  commitId: uuidSchema,
  objects: z.array(z.object({ id: uuidSchema, revisionId: uuidSchema })),
});
export const bundleSchema = z
  .object({
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(160),
            markdown: markdownSchema,
          })
          .strict(),
      )
      .min(2)
      .max(129),
  })
  .strict();

export type DemoIdentity = z.infer<typeof identitySchema>;
export type ModelSession = z.infer<typeof sessionSchema>;
export type ModelSummary = z.infer<typeof modelSummarySchema>;
export type ModelObject = z.infer<typeof modelObjectSchema>;
export type ObjectList = z.infer<typeof objectListSchema>;
export type ModelRevision = z.infer<typeof revisionSchema>;
export type Neighborhood = z.infer<typeof neighborhoodSchema>;
export type Metamodel = z.infer<typeof metamodelSchema>;
export type ModelOperation = z.infer<typeof operationSchema>;
export type Changeset = z.infer<typeof changesetSchema>;
export type ChangesetResult = z.infer<typeof changesetResultSchema>;
export type ModelView = z.infer<typeof viewSchema>;
export type ModelRelationship = z.infer<typeof relationshipSchema>;
export type KnowledgeBundle = z.infer<typeof bundleSchema>;

export const providerResultSchema = z.object({
  capability: modelSummarySchema,
  providers: z.array(
    z.object({ object: modelSummarySchema, relationship: modelSummarySchema }),
  ),
  partial: z.boolean(),
});
export const historySchema = z.object({ items: z.array(revisionSchema) });
export const validationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()),
});
export const scenarioSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  scopeId: keySchema,
  baseRecordedAt: z.iso.datetime(),
});
export const scenarioListSchema = z.object({
  items: z.array(scenarioSummarySchema),
});
export const scenarioDetailSchema = scenarioSummarySchema.extend({
  changes: z.array(
    z.object({
      kind: z.enum(['add', 'change', 'retire']),
      id: uuidSchema,
      before: z
        .object({
          revisionId: uuidSchema,
          title: z.string(),
          type: keySchema,
          lifecycle: z.string(),
        })
        .nullable(),
      after: z
        .object({
          title: z.string(),
          type: keySchema,
          lifecycle: z.string(),
          relationship: relationshipSchema.nullable(),
          effectiveFrom: z.iso.date(),
          effectiveTo: z.iso.date().nullable(),
          markdown: markdownSchema,
        })
        .nullable(),
    }),
  ),
});
export type ScenarioSummary = z.infer<typeof scenarioSummarySchema>;
export type ScenarioDetail = z.infer<typeof scenarioDetailSchema>;
