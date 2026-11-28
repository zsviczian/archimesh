import { ConceptError } from './concept-error.js';

const entityTypes = [
  { id: 'application-category', label: 'Application category' },
  { id: 'application', label: 'Application' },
  { id: 'application-instance', label: 'Application instance' },
  { id: 'capability', label: 'Capability' },
  { id: 'business-object', label: 'Business object' },
  { id: 'project', label: 'Project' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'view', label: 'View' },
  { id: 'viewpoint', label: 'Viewpoint' },
] as const;

export type EntityType = (typeof entityTypes)[number]['id'];

interface RelationshipTypeDefinition {
  id: string;
  label: string;
  sourceTypes: readonly EntityType[];
  targetTypes: readonly EntityType[];
}

const dataAccessTypes = [
  { id: 'creates', label: 'Creates' },
  { id: 'masters', label: 'Masters' },
  { id: 'reads', label: 'Reads' },
  { id: 'updates', label: 'Updates' },
] as const;

const relationshipTypes = [
  {
    id: 'categorized-as',
    label: 'Categorized as',
    sourceTypes: ['application'],
    targetTypes: ['application-category'],
  },
  {
    id: 'instance-of',
    label: 'Instance of',
    sourceTypes: ['application-instance'],
    targetTypes: ['application'],
  },
  {
    id: 'supports',
    label: 'Supports',
    sourceTypes: ['application', 'application-instance'],
    targetTypes: ['capability'],
  },
  {
    id: 'integrates-with',
    label: 'Integrates with',
    sourceTypes: ['application-instance'],
    targetTypes: ['application-instance'],
  },
  ...dataAccessTypes.map((type) => ({
    ...type,
    sourceTypes: ['application-instance'] as const,
    targetTypes: ['business-object'] as const,
  })),
  {
    id: 'impacts',
    label: 'Impacts',
    sourceTypes: ['project'],
    targetTypes: [
      'application',
      'application-instance',
      'capability',
      'business-object',
      'relationship',
    ],
  },
] as const satisfies readonly RelationshipTypeDefinition[];

export type RelationshipType = (typeof relationshipTypes)[number]['id'];

export const metamodel = { version: '1.0.0', entityTypes, relationshipTypes };

export function validateRelationship(
  type: string,
  sourceType: string,
  targetType: string,
): void {
  const definition = relationshipTypes.find((entry) => entry.id === type);
  if (
    !definition ||
    !definition.sourceTypes.some((entry) => entry === sourceType) ||
    !definition.targetTypes.some((entry) => entry === targetType)
  ) {
    throw new ConceptError(
      'This relationship type does not permit those endpoint types.',
    );
  }
}
