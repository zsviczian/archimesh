import { sql } from 'kysely';
import type { DemoIdentity } from '@archimesh/contracts';
import {
  loadDocument,
  missing,
  readModel,
  summary,
  type Db,
  type Projection,
} from './store.js';

export function findProviders(db: Db, actor: DemoIdentity, id: string) {
  return readModel(db, actor, async (tx) => {
    const capability = await loadDocument(tx, id);
    if (capability.retired || capability.data.type !== 'capability')
      throw missing();
    const rows = await sql<{ object: Projection; relationship: Projection }>`
      SELECT to_jsonb(source) AS object, to_jsonb(edge) AS relationship
      FROM model_objects AS edge
      JOIN model_objects AS source ON source.id = edge.source_id
      WHERE edge.target_id = ${id}::uuid AND NOT edge.retired AND NOT source.retired
        AND edge.data #>> '{relationship,type}' = 'supports'
      ORDER BY lower(source.title), source.id, edge.id
      LIMIT 41
    `.execute(tx);
    return {
      capability: summary(capability),
      providers: rows.rows.slice(0, 40).map(({ object, relationship }) => ({
        object: summary({ ...object, updated_at: new Date(object.updated_at) }),
        relationship: summary({
          ...relationship,
          updated_at: new Date(relationship.updated_at),
        }),
      })),
      partial: rows.rows.length > 40,
    };
  });
}
