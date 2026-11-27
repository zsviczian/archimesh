import { sql, type Kysely, type Transaction } from 'kysely';
import type {
  DemoIdentity,
  ModelObject,
  ModelSummary,
} from '@archimesh/contracts';
import type { ParsedConcept } from '@archimesh/core';

export type Db = Kysely<Record<string, never>>;
export type Tx = Transaction<Record<string, never>>;

export type ConceptData = Pick<
  ParsedConcept,
  | 'type'
  | 'title'
  | 'description'
  | 'aliases'
  | 'lifecycle'
  | 'owner'
  | 'relationship'
  | 'body'
  | 'attributes'
  | 'view'
>;

export interface Projection {
  id: string;
  scope_id: string;
  revision_id: string;
  updated_at: Date;
  retired: boolean;
  data: ConceptData;
}

export interface DocumentRow extends Projection {
  markdown: string;
  effective_from: string;
  effective_to: string | null;
}

export class ModelError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export const missing = () => new ModelError(404, 'Object or scope unavailable');
export const conflict = () =>
  new ModelError(409, 'This change conflicts with the current model');
export const invalid = (message: string) => new ModelError(422, message);

export function readModel<T>(
  db: Db,
  actor: DemoIdentity,
  action: (tx: Tx) => Promise<T>,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      await useIdentity(tx, actor);
      return action(tx);
    });
}

export async function useIdentity(tx: Tx, actor: DemoIdentity) {
  await sql`SELECT set_config('archimesh.actor', ${actor}, true)`.execute(tx);
}

export function summary(row: Projection): ModelSummary {
  const { type, title, description, aliases, lifecycle, owner, relationship } =
    row.data;
  return {
    id: row.id,
    scopeId: row.scope_id,
    type,
    title,
    description,
    aliases,
    lifecycle,
    owner,
    relationship,
    revisionId: row.revision_id,
    updatedAt: row.updated_at.toISOString(),
    retired: row.retired,
  };
}

export function detail(row: DocumentRow): ModelObject {
  const { body, attributes, view } = row.data;
  return { ...summary(row), markdown: row.markdown, body, attributes, view };
}

export async function loadDocument(tx: Tx, id: string, revision?: string) {
  const result = await sql<DocumentRow>`
    SELECT o.id, o.scope_id, r.id AS revision_id, r.recorded_at AS updated_at,
      r.retired, r.data, r.markdown,
      to_char(r.effective_from, 'YYYY-MM-DD') AS effective_from,
      to_char(r.effective_to, 'YYYY-MM-DD') AS effective_to
    FROM model_objects o
    JOIN model_revisions r ON r.object_id = o.id
      AND r.id = ${revision ? sql`${revision}::uuid` : sql`o.revision_id`}
    WHERE o.id = ${id}::uuid
  `.execute(tx);
  const row = result.rows[0];
  if (!row) throw missing();
  return row;
}

export async function canWrite(tx: Tx, scope: string) {
  const result = await sql<{ allowed: boolean }>`
    SELECT model_scope_allowed(${scope}, true) AS allowed
  `.execute(tx);
  return result.rows[0]?.allowed === true;
}
