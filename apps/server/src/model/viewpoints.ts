import type { ModelRelationship, ModelView } from '@archimesh/contracts';
import { invalid } from './store.js';

const viewpoints = {
  'solution-context': {
    objectTypes: new Set([
      'project',
      'application',
      'application-instance',
      'relationship',
      'capability',
      'business-object',
    ]),
    relationshipTypes: new Set([
      'impacts',
      'integrates-with',
      'instance-of',
      'supports',
    ]),
  },
  'business-object-map': {
    objectTypes: new Set(['application-instance', 'business-object']),
    relationshipTypes: new Set(['creates', 'masters', 'reads', 'updates']),
  },
} satisfies Record<
  ModelView['viewpoint'],
  { objectTypes: ReadonlySet<string>; relationshipTypes: ReadonlySet<string> }
>;

export function requireViewObject(view: ModelView, type: string) {
  if (!viewpoints[view.viewpoint].objectTypes.has(type)) {
    throw invalid('The saved viewpoint does not allow this object type');
  }
}

export function requireViewRelationship(
  view: ModelView,
  link: ModelRelationship | null,
) {
  if (!link || !viewpoints[view.viewpoint].relationshipTypes.has(link.type)) {
    throw invalid('The saved viewpoint does not allow this relationship type');
  }
  if (
    !view.objectIds.includes(link.sourceId) ||
    !view.objectIds.includes(link.targetId)
  ) {
    throw invalid(
      'A saved view must include both endpoints of every relationship',
    );
  }
}
