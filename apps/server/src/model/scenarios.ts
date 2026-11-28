import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  changesetSchema,
  type DemoIdentity,
  type ModelRelationship,
} from '@archimesh/contracts';
import { modelWrite, prepareProposal } from './commands.js';
import {
  canWrite,
  detail,
  invalid,
  loadDocument,
  missing,
  readModel,
  type Db,
} from './store.js';

export const scenarioRequest = z
  .object({
    name: z.string().trim().min(1).max(120),
    scopeId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    operations: changesetSchema.shape.operations,
  })
  .strict();

type ScenarioInput = z.infer<typeof scenarioRequest>;

interface ScenarioMetadata {
  id: string;
  name: string;
  scopeId: string;
  baseRecordedAt: Date;
}

interface PlannedChange {
  kind: 'add' | 'change' | 'retire';
  id: string;
  before: {
    revisionId: string;
    title: string;
    type: string;
    lifecycle: string;
  } | null;
  after: {
    title: string;
    type: string;
    lifecycle: string;
    relationship: ModelRelationship | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    markdown: string;
  } | null;
}

interface Scenario extends ScenarioMetadata {
  changes: PlannedChange[];
}

const serialize = (scenario: ScenarioMetadata) => ({
  ...scenario,
  baseRecordedAt: scenario.baseRecordedAt.toISOString(),
});

const metadata = sql`id, name, scope_id AS "scopeId", created_at AS "baseRecordedAt"`;

export function createScenario(
  db: Db,
  actor: DemoIdentity,
  input: ScenarioInput,
  id = randomUUID(),
) {
  return modelWrite(db, actor, async (tx) => {
    if (!(await canWrite(tx, input.scopeId))) throw missing();
    const prior =
      await sql<ScenarioMetadata>`SELECT ${metadata} FROM model_scenarios WHERE id = ${id}`.execute(
        tx,
      );
    if (prior.rows[0]) return serialize(prior.rows[0]);

    const pending = await prepareProposal(tx, actor, input.operations);
    const changes: PlannedChange[] = [];
    for (const [objectId, item] of pending) {
      if (item.scopeId !== input.scopeId)
        throw invalid('A proposal can change only objects in its own scope');
      const original = item.previousRevision
        ? detail(await loadDocument(tx, objectId, item.previousRevision))
        : null;
      const {
        title,
        type,
        lifecycle,
        relationship,
        effectiveFrom,
        effectiveTo,
      } = item.concept;
      changes.push({
        kind: item.retired ? 'retire' : original ? 'change' : 'add',
        id: objectId,
        before: original
          ? {
              revisionId: original.revisionId,
              title: original.title,
              type: original.type,
              lifecycle: original.lifecycle,
            }
          : null,
        after: item.retired
          ? null
          : {
              title,
              type,
              lifecycle,
              relationship,
              effectiveFrom,
              effectiveTo,
              markdown: item.markdown,
            },
      });
    }
    const baseRecordedAt = new Date();
    await sql`
      INSERT INTO model_scenarios (id, name, scope_id, base_sequence, created_at, operations)
      SELECT ${id}, ${input.name}, ${input.scopeId}, coalesce(max(commit_sequence), 0),
        ${baseRecordedAt}, ${JSON.stringify(changes)}::jsonb FROM model_revisions
    `.execute(tx);
    return serialize({
      id,
      name: input.name,
      scopeId: input.scopeId,
      baseRecordedAt,
    });
  });
}

export function listScenarios(db: Db, actor: DemoIdentity) {
  return readModel(db, actor, async (tx) => {
    const rows = await sql<ScenarioMetadata>`
      SELECT ${metadata} FROM model_scenarios ORDER BY created_at DESC, id LIMIT 100
    `.execute(tx);
    return { items: rows.rows.map(serialize) };
  });
}

export function getScenario(db: Db, actor: DemoIdentity, id: string) {
  return readModel(db, actor, async (tx) => {
    const rows = await sql<Scenario>`
      SELECT ${metadata}, operations AS changes FROM model_scenarios WHERE id = ${id}
    `.execute(tx);
    const scenario = rows.rows[0];
    if (!scenario) throw missing();
    return { ...serialize(scenario), changes: scenario.changes };
  });
}
