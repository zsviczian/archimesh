import type {
  ModelObject,
  ModelSummary,
  ModelView,
  Neighborhood,
} from '@archimesh/contracts';

type RelationshipSummary = ModelSummary & {
  attributes?: ModelObject['attributes'];
};
export type Graph = Omit<Neighborhood, 'edges'> & {
  edges: RelationshipSummary[];
};
export type Link = RelationshipSummary & {
  relationship: NonNullable<ModelSummary['relationship']>;
};

export function completeLinks(graph: Graph): Link[] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  return graph.edges.filter((item): item is Link =>
    Boolean(
      item.relationship &&
      ids.has(item.relationship.sourceId) &&
      ids.has(item.relationship.targetId),
    ),
  );
}

export function makeViewGraph(view: ModelView, objects: ModelObject[]): Graph {
  const byId = new Map(
    objects.filter((object) => !object.retired).map((item) => [item.id, item]),
  );
  const nodes = view.objectIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const graph = {
    nodes,
    edges: view.relationshipIds.flatMap((id) => {
      const item = byId.get(id);
      return item?.relationship ? [item] : [];
    }),
    partial: false,
  };
  const edges = completeLinks(graph);
  return {
    nodes,
    edges,
    partial:
      nodes.length !== view.objectIds.length ||
      edges.length !== view.relationshipIds.length,
  };
}
