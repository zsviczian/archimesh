import { Ajv } from 'ajv';
import {
  isAlias,
  isMap,
  isScalar,
  parseDocument,
  stringify,
  visit,
} from 'yaml';
import { ConceptError } from './concept-error.js';
import {
  metamodel,
  type EntityType,
  type RelationshipType,
} from './metamodel.js';

export const okfVersion = '0.3';
export const okfSpecRevision = '527e81aff55992be21507e97004286789126f88c';
const modelKey = 'x-archimesh-model';
const defaultEffectiveFrom = '1970-01-01';
const lifecycleValues = ['draft', 'active', 'retired'] as const;
const viewpointValues = ['solution-context', 'business-object-map'] as const;

export type Lifecycle = (typeof lifecycleValues)[number];
export type Viewpoint = (typeof viewpointValues)[number];
export type Position = { x: number; y: number };
export type ViewPositions = Record<string, Position>;

export interface ConceptRelationship {
  type: RelationshipType;
  sourceId: string;
  targetId: string;
}

interface ViewInput {
  viewpoint: Viewpoint;
  objectIds: string[];
  relationshipIds: string[];
  positions?: ViewPositions;
}

export interface ConceptView extends ViewInput {
  positions: ViewPositions;
}

export interface ParsedConcept {
  id: string;
  type: EntityType;
  title: string;
  description: string;
  aliases: string[];
  lifecycle: Lifecycle;
  owner: string | null;
  relationship: ConceptRelationship | null;
  body: string;
  attributes: Record<string, unknown>;
  view: ConceptView | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type ConceptInput = Pick<ParsedConcept, 'id' | 'title' | 'body'> & {
  type: string;
} & Partial<
    Omit<
      ParsedConcept,
      'id' | 'type' | 'title' | 'body' | 'view' | 'relationship'
    >
  > & {
    view?: ViewInput | null;
    relationship?:
      (Omit<ConceptRelationship, 'type'> & { type: string }) | null;
  };

interface Frontmatter {
  type: EntityType;
  title: string;
  description?: string;
  aliases?: string[];
  [modelKey]: {
    id: string;
    lifecycle?: Lifecycle;
    owner?: string | null;
    attributes?: Record<string, unknown>;
    relationship?: ConceptRelationship;
    view?: ViewInput;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  };
}

const uuidPattern =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const uuidSchema = { type: 'string', pattern: uuidPattern };
const dateSchema = { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' };
const coordinateSchema = { type: 'number', minimum: -10000, maximum: 10000 };
const modelSchema = {
  type: 'object',
  required: ['type', 'title', modelKey],
  properties: {
    type: { type: 'string', enum: metamodel.entityTypes.map(({ id }) => id) },
    title: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    description: { type: 'string', maxLength: 1000 },
    aliases: {
      type: 'array',
      maxItems: 30,
      items: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    },
    [modelKey]: {
      type: 'object',
      required: ['id'],
      properties: {
        id: uuidSchema,
        lifecycle: { type: 'string', enum: lifecycleValues },
        owner: {
          anyOf: [
            { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
            { type: 'null' },
          ],
        },
        attributes: { type: 'object' },
        relationship: {
          type: 'object',
          required: ['type', 'sourceId', 'targetId'],
          properties: {
            type: {
              type: 'string',
              enum: metamodel.relationshipTypes.map(({ id }) => id),
            },
            sourceId: uuidSchema,
            targetId: uuidSchema,
          },
        },
        view: {
          type: 'object',
          required: ['viewpoint', 'objectIds', 'relationshipIds'],
          properties: {
            viewpoint: { type: 'string', enum: viewpointValues },
            objectIds: {
              type: 'array',
              items: uuidSchema,
              uniqueItems: true,
              maxItems: 80,
            },
            relationshipIds: {
              type: 'array',
              items: uuidSchema,
              uniqueItems: true,
              maxItems: 120,
            },
            positions: {
              type: 'object',
              maxProperties: 80,
              propertyNames: uuidSchema,
              additionalProperties: {
                type: 'object',
                required: ['x', 'y'],
                properties: { x: coordinateSchema, y: coordinateSchema },
              },
            },
          },
        },
        effectiveFrom: dateSchema,
        effectiveTo: { anyOf: [dateSchema, { type: 'null' }] },
      },
    },
  },
};
const validateFrontmatter = new Ajv({
  ownProperties: true,
}).compile<Frontmatter>(modelSchema);

const invalidYaml =
  'Frontmatter must be a safe YAML 1.2 mapping with unique keys.';
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype', '<<']);

function containsUnsupportedCharacters(value: string): boolean {
  return value.includes('\0') || /[\uD800-\uDFFF]/u.test(value);
}

function readFrontmatter(markdown: string) {
  if (markdown.length > 64 * 1024) {
    throw new ConceptError(
      'Concept Markdown exceeds the 64 Ki character limit.',
    );
  }
  if (containsUnsupportedCharacters(markdown)) {
    throw new ConceptError('Concept Markdown contains invalid characters.');
  }

  const opening = /^---(\r?\n)/.exec(markdown);
  const source = markdown.slice(opening?.[0].length ?? 0);
  const closing = /^---(?:\r?\n|$)/m.exec(source);
  if (!opening || !closing) {
    throw new ConceptError(
      'Start the concept with YAML frontmatter between delimiter lines.',
    );
  }
  if (closing.index > 24 * 1024) {
    throw new ConceptError(
      'Concept frontmatter exceeds the 24 Ki character limit.',
    );
  }

  try {
    const document = parseDocument(source.slice(0, closing.index), {
      version: '1.2',
      schema: 'core',
      uniqueKeys: true,
      merge: false,
    });
    if (
      document.errors.length ||
      document.warnings.length ||
      document.directives?.yaml.explicit ||
      document.directives?.docStart ||
      document.directives?.docEnd ||
      !isMap(document.contents)
    ) {
      throw new ConceptError(invalidYaml);
    }
    visit(document, {
      Node(_key, node, path) {
        if (
          path.length > 32 ||
          isAlias(node) ||
          node.tag ||
          ('anchor' in node && node.anchor)
        ) {
          throw new ConceptError(invalidYaml);
        }
        if (
          isScalar(node) &&
          ((typeof node.value === 'number' &&
            (!Number.isFinite(node.value) ||
              (Number.isInteger(node.value) &&
                !Number.isSafeInteger(node.value)))) ||
            (typeof node.value === 'string' &&
              containsUnsupportedCharacters(node.value)))
        ) {
          throw new ConceptError(invalidYaml);
        }
      },
      Pair(_key, pair) {
        if (
          !isScalar(pair.key) ||
          typeof pair.key.value !== 'string' ||
          forbiddenKeys.has(pair.key.value)
        ) {
          throw new ConceptError(invalidYaml);
        }
      },
    });
    const metadata: unknown = document.toJS({ maxAliasCount: 0 });
    return {
      document,
      metadata,
      lineBreak: opening[1],
      body: source.slice(closing.index + closing[0].length),
    };
  } catch {
    throw new ConceptError(invalidYaml);
  }
}

export function parseSafeFrontmatter(markdown: string): unknown {
  return readFrontmatter(markdown).metadata;
}

function isCalendarDate(value: string): boolean {
  if (value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function parseMetadata(metadata: unknown, body: string): ParsedConcept {
  if (!validateFrontmatter(metadata)) {
    const error = validateFrontmatter.errors?.[0];
    const path = error?.instancePath.split('/').slice(1);
    const field = path?.[0] === modelKey ? path[1] : path?.[0];
    const knownFields = [
      'type',
      'title',
      'description',
      'aliases',
      'id',
      'lifecycle',
      'owner',
      'attributes',
      'relationship',
      'view',
      'effectiveFrom',
      'effectiveTo',
    ];
    const label = knownFields.find((name) => name === field);
    throw new ConceptError(
      label
        ? 'The ' + label + ' field is invalid.'
        : 'The concept does not match the ArchiMesh profile.',
    );
  }

  const model = metadata[modelKey];
  const lifecycle = model.lifecycle ?? 'draft';
  const owner = model.owner ?? null;
  if (
    metadata.type === 'application-instance' &&
    lifecycle === 'active' &&
    !owner
  ) {
    throw new ConceptError(
      'An active application instance requires an accountable owner.',
    );
  }

  const relationship = model.relationship
    ? {
        type: model.relationship.type,
        sourceId: model.relationship.sourceId,
        targetId: model.relationship.targetId,
      }
    : null;
  if ((metadata.type === 'relationship') !== (relationship !== null)) {
    throw new ConceptError(
      'Relationship concepts require typed endpoints in their relationship field.',
    );
  }
  if (
    relationship?.sourceId === model.id ||
    relationship?.targetId === model.id
  ) {
    throw new ConceptError('A relationship cannot use itself as an endpoint.');
  }

  const view = model.view
    ? {
        viewpoint: model.view.viewpoint,
        objectIds: model.view.objectIds,
        relationshipIds: model.view.relationshipIds,
        positions: Object.fromEntries(
          Object.entries(model.view.positions ?? {}).map(([id, { x, y }]) => [
            id,
            { x, y },
          ]),
        ),
      }
    : null;
  if ((metadata.type === 'view') !== (view !== null)) {
    throw new ConceptError(
      'View concepts require a viewpoint and a selection in their view field.',
    );
  }
  if (
    view &&
    Object.keys(view.positions).some((id) => !view.objectIds.includes(id))
  ) {
    throw new ConceptError(
      'View positions must refer to objects included in the view.',
    );
  }

  const effectiveFrom = model.effectiveFrom ?? defaultEffectiveFrom;
  const effectiveTo = model.effectiveTo ?? null;
  if (
    !isCalendarDate(effectiveFrom) ||
    (effectiveTo !== null &&
      (!isCalendarDate(effectiveTo) || effectiveTo <= effectiveFrom))
  ) {
    throw new ConceptError(
      'Effective dates must define an increasing interval of valid calendar dates.',
    );
  }

  return {
    id: model.id,
    type: metadata.type,
    title: metadata.title,
    description: metadata.description ?? '',
    aliases: metadata.aliases ?? [],
    body,
    lifecycle,
    owner,
    attributes: model.attributes ?? {},
    relationship,
    view,
    effectiveFrom,
    effectiveTo,
  };
}

export function parseConcept(markdown: string): ParsedConcept {
  const { metadata, body } = readFrontmatter(markdown);
  return parseMetadata(metadata, body);
}

export function serializeConcept(concept: ConceptInput): string {
  const {
    type,
    title,
    description,
    aliases,
    body,
    id,
    lifecycle,
    owner,
    attributes,
    relationship,
    view,
    effectiveFrom,
    effectiveTo,
  } = concept;
  const frontmatter = stringify(
    {
      type,
      title,
      ...(description === undefined ? {} : { description }),
      ...(aliases === undefined ? {} : { aliases }),
      [modelKey]: {
        id,
        ...(lifecycle === undefined ? {} : { lifecycle }),
        ...(owner === undefined ? {} : { owner }),
        ...(attributes === undefined ? {} : { attributes }),
        ...(relationship == null ? {} : { relationship }),
        ...(view == null ? {} : { view }),
        ...(effectiveFrom === undefined ? {} : { effectiveFrom }),
        ...(effectiveTo === undefined ? {} : { effectiveTo }),
      },
    },
    { aliasDuplicateObjects: false, lineWidth: 0 },
  );
  const markdown = '---\n' + frontmatter + '---\n' + body;
  parseConcept(markdown);
  return markdown;
}

function formatEdit(source: ReturnType<typeof readFrontmatter>): string {
  const { document, body, lineBreak } = source;
  const frontmatter = document
    .toString({ directives: false, lineWidth: 0 })
    .replaceAll('\n', lineBreak);
  const markdown = '---' + lineBreak + frontmatter + '---' + lineBreak + body;
  parseConcept(markdown);
  return markdown;
}

export function withViewPositions(
  markdown: string,
  positions: ViewPositions,
): string {
  const source = readFrontmatter(markdown);
  const concept = parseMetadata(source.metadata, source.body);
  if (!concept.view)
    throw new ConceptError('Positions can only be saved for a view.');
  const path = [modelKey, 'view', 'positions'];
  const existing = source.document.getIn(path, true);
  if (isMap(existing)) {
    for (const { key } of [...existing.items]) {
      if (isScalar(key) && !Object.hasOwn(positions, String(key.value))) {
        existing.delete(key.value);
      }
    }
  }
  for (const [id, { x, y }] of Object.entries(positions)) {
    source.document.setIn([...path, id, 'x'], x);
    source.document.setIn([...path, id, 'y'], y);
  }
  return formatEdit(source);
}

export function remapConceptIds(
  markdown: string,
  ids: ReadonlyMap<string, string>,
): string {
  const source = readFrontmatter(markdown);
  const concept = parseMetadata(source.metadata, source.body);
  const remap = (id: string) => ids.get(id) ?? id;
  let changed = false;
  const setId = (path: (string | number)[], id: string) => {
    const next = remap(id);
    if (next !== id) {
      source.document.setIn([modelKey, ...path], next);
      changed = true;
    }
  };

  setId(['id'], concept.id);
  if (concept.relationship) {
    setId(['relationship', 'sourceId'], concept.relationship.sourceId);
    setId(['relationship', 'targetId'], concept.relationship.targetId);
  }
  if (concept.view) {
    concept.view.objectIds.forEach((id, index) =>
      setId(['view', 'objectIds', index], id),
    );
    concept.view.relationshipIds.forEach((id, index) =>
      setId(['view', 'relationshipIds', index], id),
    );
    const positions = source.document.getIn(
      [modelKey, 'view', 'positions'],
      true,
    );
    if (isMap(positions)) {
      for (const { key } of positions.items) {
        if (!isScalar(key) || typeof key.value !== 'string') continue;
        const next = remap(key.value);
        if (next !== key.value) {
          key.value = next;
          changed = true;
        }
      }
    }
  }

  return changed ? formatEdit(source) : markdown;
}
