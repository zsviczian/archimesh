import { createHash } from 'node:crypto';
import { serializeConcept } from '@archimesh/core';

export type DemoScope = 'shared' | 'procurement' | 'integration';

export interface DemoDocument {
  scopeId: DemoScope;
  path: string;
  markdown: string;
}

type ConceptInput = Parameters<typeof serializeConcept>[0];
type RelationshipInput = NonNullable<ConceptInput['relationship']>;
type ViewInput = NonNullable<ConceptInput['view']>;
type CatalogEntry = readonly [key: string, title: string, description: string];

const categories: CatalogEntry[] = [
  [
    'erp',
    'Enterprise Resource Planning',
    'Core financial and inventory records',
  ],
  [
    'supplier-management',
    'Supplier Management',
    'Supplier identity, onboarding and assurance',
  ],
  [
    'procurement-suite',
    'Procurement Suite',
    'Sourcing, requisitions and ordering',
  ],
  [
    'integration-platform',
    'Integration Platform',
    'Event routing and external exchanges',
  ],
  [
    'enterprise-intelligence',
    'Enterprise Intelligence',
    'Operational reporting and analysis',
  ],
];

const applications: Array<
  readonly [...CatalogEntry, category: string, version: string]
> = [
  [
    'ledgerline',
    'Ledgerline ERP',
    'Financial posting and inventory controls',
    'erp',
    '8.2',
  ],
  [
    'payweave',
    'PayWeave Finance',
    'Invoice matching and settlements',
    'erp',
    '4.0',
  ],
  [
    'supplier-harbor',
    'Supplier Harbor',
    'Reusable registration and validation of suppliers',
    'supplier-management',
    '3.4',
  ],
  [
    'vendor-audit',
    'Vendor Audit Registry',
    'Supplier assurance evidence',
    'supplier-management',
    '2.1',
  ],
  [
    'purchase-desk',
    'Purchase Desk',
    'Requisition and purchase order workflow',
    'procurement-suite',
    '5.0',
  ],
  [
    'bidshelf',
    'BidShelf',
    'Sourcing rounds and commercial evaluation',
    'procurement-suite',
    '1.8',
  ],
  [
    'transfer-hub',
    'Transfer Hub',
    'Reliable application event delivery',
    'integration-platform',
    '7.1',
  ],
  [
    'freight-link',
    'Freight Link',
    'Warehouse and logistics partner messaging',
    'integration-platform',
    '2.3',
  ],
  [
    'inventory-lens',
    'Inventory Lens',
    'Regional inventory visibility',
    'enterprise-intelligence',
    '3.2',
  ],
  [
    'spend-studio',
    'Spend Studio',
    'Contract and category spend analysis',
    'enterprise-intelligence',
    '6.1',
  ],
];

const instances: Array<
  readonly [
    key: string,
    title: string,
    application: string,
    owner: string,
    region: 'North' | 'Coastal',
  ]
> = [
  [
    'ledgerline-north',
    'Ledgerline North',
    'ledgerline',
    'North Enterprise Systems',
    'North',
  ],
  [
    'ledgerline-coastal',
    'Ledgerline Coastal',
    'ledgerline',
    'Coastal Enterprise Systems',
    'Coastal',
  ],
  [
    'payweave-north',
    'PayWeave North',
    'payweave',
    'North Finance Systems',
    'North',
  ],
  [
    'payweave-coastal',
    'PayWeave Coastal',
    'payweave',
    'Coastal Finance Systems',
    'Coastal',
  ],
  [
    'supplier-harbor-north',
    'Supplier Harbor North',
    'supplier-harbor',
    'Supplier Operations',
    'North',
  ],
  [
    'supplier-harbor-coastal',
    'Supplier Harbor Coastal',
    'supplier-harbor',
    'Supplier Operations',
    'Coastal',
  ],
  [
    'vendor-audit-north',
    'Vendor Audit North',
    'vendor-audit',
    'Third-Party Risk',
    'North',
  ],
  [
    'vendor-audit-coastal',
    'Vendor Audit Coastal',
    'vendor-audit',
    'Third-Party Risk',
    'Coastal',
  ],
  [
    'purchase-desk-north',
    'Purchase Desk North',
    'purchase-desk',
    'Procurement Operations',
    'North',
  ],
  [
    'purchase-desk-coastal',
    'Purchase Desk Coastal',
    'purchase-desk',
    'Procurement Operations',
    'Coastal',
  ],
  [
    'bidshelf-north',
    'BidShelf North',
    'bidshelf',
    'Strategic Sourcing',
    'North',
  ],
  [
    'bidshelf-coastal',
    'BidShelf Coastal',
    'bidshelf',
    'Strategic Sourcing',
    'Coastal',
  ],
  [
    'transfer-hub-north',
    'Transfer Hub North',
    'transfer-hub',
    'Integration Services',
    'North',
  ],
  [
    'transfer-hub-coastal',
    'Transfer Hub Coastal',
    'transfer-hub',
    'Integration Services',
    'Coastal',
  ],
  [
    'freight-link-north',
    'Freight Link North',
    'freight-link',
    'Logistics Systems',
    'North',
  ],
  [
    'freight-link-coastal',
    'Freight Link Coastal',
    'freight-link',
    'Logistics Systems',
    'Coastal',
  ],
  [
    'inventory-lens-north',
    'Inventory Lens North',
    'inventory-lens',
    'Warehouse Analytics',
    'North',
  ],
  [
    'inventory-lens-coastal',
    'Inventory Lens Coastal',
    'inventory-lens',
    'Warehouse Analytics',
    'Coastal',
  ],
  [
    'spend-studio-north',
    'Spend Studio North',
    'spend-studio',
    'Commercial Analytics',
    'North',
  ],
  [
    'spend-studio-coastal',
    'Spend Studio Coastal',
    'spend-studio',
    'Commercial Analytics',
    'Coastal',
  ],
];

const capabilities: CatalogEntry[] = [
  [
    'supplier-onboarding',
    'Supplier Onboarding',
    'Register suppliers, validate identity and reuse approved profiles',
  ],
  [
    'supplier-qualification',
    'Supplier Qualification',
    'Confirm supplier eligibility for a given region and category',
  ],
  [
    'supplier-risk',
    'Supplier Risk Assessment',
    'Collect evidence and review supplier risk',
  ],
  [
    'supplier-performance',
    'Supplier Performance Management',
    'Evaluate service, quality and delivery outcomes',
  ],
  [
    'requisitioning',
    'Purchase Requisitioning',
    'Capture and route internal procurement demand',
  ],
  [
    'purchase-ordering',
    'Purchase Ordering',
    'Issue approved purchase orders and record amendments',
  ],
  [
    'strategic-sourcing',
    'Strategic Sourcing',
    'Run sourcing rounds and select suppliers',
  ],
  [
    'contract-administration',
    'Contract Administration',
    'Maintain contracts, terms and renewal dates',
  ],
  [
    'invoice-matching',
    'Invoice Matching',
    'Reconcile invoices with orders and receipts',
  ],
  ['supplier-settlements', 'Supplier Settlements', 'Release approved payments'],
  [
    'receiving',
    'Goods Receiving',
    'Record delivery and acceptance of ordered material',
  ],
  [
    'inventory-accounting',
    'Inventory Accounting',
    'Post stock movements and valuation changes',
  ],
  [
    'stock-visibility',
    'Stock Visibility',
    'Inspect available stock across sites',
  ],
  [
    'warehouse-location-management',
    'Warehouse Location Management',
    'Manage storage locations and site identifiers',
  ],
  [
    'freight-booking',
    'Freight Booking',
    'Book collection and delivery with logistics partners',
  ],
  [
    'delivery-tracking',
    'Delivery Tracking',
    'Track shipment milestones and exceptions',
  ],
  [
    'enterprise-event-routing',
    'Enterprise Event Routing',
    'Route canonical events between application installations',
  ],
  [
    'event-replay',
    'Event Replay',
    'Recover failed event delivery with an auditable replay',
  ],
  [
    'spend-analysis',
    'Spend Analysis',
    'Analyze purchasing by supplier, region and category',
  ],
  [
    'budget-control',
    'Budget Control',
    'Verify procurement demand against approved budgets',
  ],
];

const businessObjects: CatalogEntry[] = [
  [
    'supplier',
    'Supplier',
    'Organization providing goods or services to Alderfen Works',
  ],
  [
    'supplier-site',
    'Supplier Site',
    'Supplier facility approved for delivery or payment',
  ],
  [
    'qualification',
    'Supplier Qualification Record',
    'Category and region eligibility decision for a supplier',
  ],
  [
    'requisition',
    'Purchase Requisition',
    'Internal request for goods or services',
  ],
  [
    'purchase-order',
    'Purchase Order',
    'Approved instruction to a supplier to provide goods or services',
  ],
  [
    'purchase-order-line',
    'Purchase Order Line',
    'Quantity, price and delivery terms for one ordered item',
  ],
  [
    'sourcing-round',
    'Sourcing Round',
    'Time-bound request for competing supplier bids',
  ],
  ['supplier-bid', 'Supplier Bid', 'Commercial response to a sourcing round'],
  [
    'supply-contract',
    'Supply Contract',
    'Commercial agreement governing a supplier relationship',
  ],
  ['invoice', 'Supplier Invoice', 'Supplier request for payment'],
  [
    'goods-receipt',
    'Goods Receipt',
    'Confirmation that ordered material arrived and was accepted',
  ],
  [
    'inventory-item',
    'Inventory Item',
    'Item identity used for stocking and procurement',
  ],
  [
    'stock-movement',
    'Stock Movement',
    'Movement of inventory between locations or owners',
  ],
  [
    'shipment',
    'Shipment',
    'Goods moving together under one logistics instruction',
  ],
  [
    'delivery-event',
    'Delivery Event',
    'Timestamped milestone in a shipment lifecycle',
  ],
];

interface DemoRelationship {
  key: string;
  type: RelationshipInput['type'];
  source: string;
  target: string;
  title: string;
  description: string;
  scopeId?: DemoScope;
  proposed?: boolean;
  attributes?: ConceptInput['attributes'];
}

const relationships: DemoRelationship[] = [
  {
    key: 'supplier-provider',
    type: 'supports',
    source: 'supplier-harbor-north',
    target: 'supplier-onboarding',
    title: 'Supplier Harbor North provides Supplier Onboarding',
    description:
      'Reusable supplier registration and approval for North Works projects.',
    attributes: { reuseStatus: 'available', geography: 'North' },
  },
  {
    key: 'supplier-qualification-provider',
    type: 'supports',
    source: 'supplier-harbor-coastal',
    target: 'supplier-qualification',
    title: 'Supplier Harbor Coastal supports Supplier Qualification',
    description:
      'Validates category and region eligibility for Coastal Works suppliers.',
  },
  {
    key: 'supplier-risk-provider',
    type: 'supports',
    source: 'vendor-audit-north',
    target: 'supplier-risk',
    title: 'Vendor Audit North supports Supplier Risk Assessment',
    description:
      'Holds assurance evidence for North Works third-party reviews.',
  },
  {
    key: 'purchase-north-provider',
    type: 'supports',
    source: 'purchase-desk-north',
    target: 'purchase-ordering',
    title: 'Purchase Desk North would support Purchase Ordering',
    description: 'Target ownership of the North Works purchase order workflow.',
    scopeId: 'procurement',
    proposed: true,
  },
  {
    key: 'legacy-supplier-sync',
    type: 'integrates-with',
    source: 'ledgerline-north',
    target: 'supplier-harbor-north',
    title:
      'Ledgerline North exchanges supplier data with Supplier Harbor North',
    description:
      'Existing nightly supplier reference feed with the ERP installation.',
    attributes: { exchange: 'Nightly file', state: 'existing' },
  },
  {
    key: 'target-supplier-sync',
    type: 'integrates-with',
    source: 'purchase-desk-north',
    target: 'supplier-harbor-north',
    title:
      'Purchase Desk North would reuse the Supplier Harbor supplier service',
    description:
      'Proposed approved-supplier lookup from the new procurement installation.',
    scopeId: 'procurement',
    proposed: true,
    attributes: { exchange: 'Supplier lookup API' },
  },
  {
    key: 'coastal-freight-sync',
    type: 'integrates-with',
    source: 'transfer-hub-coastal',
    target: 'freight-link-coastal',
    title: 'Transfer Hub Coastal would forward freight status events',
    description: 'Proposed event delivery with replay after partner outages.',
    scopeId: 'integration',
    proposed: true,
    attributes: { exchange: 'Delivery event stream' },
  },
  {
    key: 'north-freight-sync',
    type: 'integrates-with',
    source: 'transfer-hub-north',
    target: 'freight-link-north',
    title: 'Transfer Hub North forwards freight status events',
    description: 'Operating baseline used by the Coastal freight project.',
    attributes: { exchange: 'Delivery event stream', state: 'existing' },
  },
  {
    key: 'harbor-creates-supplier',
    type: 'creates',
    source: 'supplier-harbor-north',
    target: 'supplier',
    title: 'Supplier Harbor North creates supplier records',
    description: 'Creates the regional supplier record after registration.',
    attributes: { geography: 'North' },
  },
  {
    key: 'harbor-masters-supplier',
    type: 'masters',
    source: 'supplier-harbor-north',
    target: 'supplier',
    title: 'Supplier Harbor North masters North supplier identity',
    description:
      'Authoritative identity and approval status for North Works suppliers.',
    attributes: { geography: 'North', domain: 'Supplier identity' },
  },
  {
    key: 'erp-reads-supplier',
    type: 'reads',
    source: 'ledgerline-north',
    target: 'supplier',
    title: 'Ledgerline North reads supplier records',
    description:
      'Looks up approved supplier identifiers for purchasing and posting.',
  },
  {
    key: 'erp-updates-order',
    type: 'updates',
    source: 'ledgerline-north',
    target: 'purchase-order',
    title: 'Ledgerline North updates purchase order status',
    description: 'Records fulfillment and closeout on the operational order.',
  },
  {
    key: 'erp-creates-order',
    type: 'creates',
    source: 'ledgerline-north',
    target: 'purchase-order',
    title: 'Ledgerline North creates purchase orders',
    description: 'Current ordering responsibility for North Works.',
  },
  {
    key: 'purchase-creates-order',
    type: 'creates',
    source: 'purchase-desk-north',
    target: 'purchase-order',
    title: 'Purchase Desk North would create purchase orders',
    description:
      'Proposed replacement for the operational ERP ordering workflow.',
    scopeId: 'procurement',
    proposed: true,
  },
  {
    key: 'spend-reads-contract',
    type: 'reads',
    source: 'spend-studio-north',
    target: 'supply-contract',
    title: 'Spend Studio North reads supply contracts',
    description:
      'Uses contracted categories and terms for commercial analysis.',
  },
  {
    key: 'procurement-impacts-purchase',
    type: 'impacts',
    source: 'procurement-project',
    target: 'purchase-desk-north',
    title: 'Procurement Modernization proposes Purchase Desk North',
    description:
      'Introduce a dedicated procurement installation for North Works.',
    scopeId: 'procurement',
    proposed: true,
    attributes: { change: 'introduce' },
  },
  {
    key: 'procurement-retires-legacy',
    type: 'impacts',
    source: 'procurement-project',
    target: 'legacy-supplier-sync',
    title:
      'Procurement Modernization proposes retiring the nightly supplier feed',
    description: 'Retirement depends on successful rollout and reconciliation.',
    scopeId: 'procurement',
    proposed: true,
    attributes: { change: 'retire' },
  },
  {
    key: 'procurement-adds-supplier',
    type: 'impacts',
    source: 'procurement-project',
    target: 'target-supplier-sync',
    title: 'Procurement Modernization proposes the supplier lookup integration',
    description:
      'Reuse the existing supplier capability with a new integration.',
    scopeId: 'procurement',
    proposed: true,
    attributes: { change: 'introduce' },
  },
  {
    key: 'integration-impacts-transfer',
    type: 'impacts',
    source: 'integration-project',
    target: 'transfer-hub-coastal',
    title: 'Freight Event Integration extends Transfer Hub Coastal',
    description:
      'Enable the Coastal Works installation to deliver replayable freight events.',
    scopeId: 'integration',
    proposed: true,
    attributes: { change: 'modify' },
  },
  {
    key: 'integration-adds-freight',
    type: 'impacts',
    source: 'integration-project',
    target: 'coastal-freight-sync',
    title: 'Freight Event Integration proposes a Coastal event route',
    description:
      'Apply the operating North Works pattern to the Coastal installations.',
    scopeId: 'integration',
    proposed: true,
    attributes: { change: 'introduce' },
  },
];

function demoId(key: string): string {
  const hash = createHash('sha256')
    .update(`archimesh:alderfen-works:${key}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export const demoIds = {
  supplierCapability: demoId('supplier-onboarding'),
  supplierProvider: demoId('supplier-harbor-north'),
  supplierRelationship: demoId('supplier-provider'),
  supplierObject: demoId('supplier'),
  procurementProject: demoId('procurement-project'),
  integrationProject: demoId('integration-project'),
  legacySupplierIntegration: demoId('legacy-supplier-sync'),
  proposedSupplierIntegration: demoId('target-supplier-sync'),
  solutionContextView: demoId('procurement-context'),
  businessObjectMapView: demoId('supplier-order-map'),
} as const;

function modelView(
  viewpoint: ViewInput['viewpoint'],
  nodes: Array<readonly [key: string, x: number, y: number]>,
  edges: string[],
): ViewInput {
  return {
    viewpoint,
    objectIds: nodes.map(([key]) => demoId(key)),
    relationshipIds: edges.map(demoId),
    positions: Object.fromEntries(
      nodes.map(([key, x, y]) => [demoId(key), { x, y }]),
    ),
  };
}

export function buildDemoBundle(): DemoDocument[] {
  const documents: DemoDocument[] = [];
  const append = (
    key: string,
    options: Omit<ConceptInput, 'id'>,
    scopeId: DemoScope = 'shared',
  ) => {
    const id = demoId(key);
    documents.push({
      scopeId,
      path: `objects/${id}.md`,
      markdown: serializeConcept({ id, ...options }),
    });
  };

  for (const [key, title, description] of categories) {
    append(key, {
      type: 'application-category',
      title,
      description,
      body: description,
      lifecycle: 'active',
    });
  }
  for (const [key, title, description, category, version] of applications) {
    append(key, {
      type: 'application',
      title,
      description,
      body: description,
      lifecycle: 'active',
      owner: 'Enterprise Applications',
      attributes: { version },
    });
    append(`category-of:${key}`, {
      type: 'relationship',
      title: `${title} application category`,
      body: 'Classifies the application in the enterprise catalog.',
      lifecycle: 'active',
      relationship: {
        type: 'categorized-as',
        sourceId: demoId(key),
        targetId: demoId(category),
      },
    });
  }
  for (const [key, title, application, owner, region] of instances) {
    const proposed = key === 'purchase-desk-north';
    const scopeId = proposed ? 'procurement' : 'shared';
    const lifecycle = proposed ? 'draft' : 'active';
    const description = proposed
      ? 'Proposed dedicated installation for modernizing North Works procurement.'
      : `Operational installation serving Alderfen Works’ ${region} region.`;
    append(
      key,
      {
        type: 'application-instance',
        title,
        description,
        body: description,
        lifecycle,
        owner,
        attributes: { region, state: proposed ? 'proposed' : 'operating' },
      },
      scopeId,
    );
    append(
      `instance-of:${key}`,
      {
        type: 'relationship',
        title: `${title} installation of`,
        body: 'Identifies the logical application deployed for this organizational installation.',
        lifecycle,
        owner,
        relationship: {
          type: 'instance-of',
          sourceId: demoId(key),
          targetId: demoId(application),
        },
      },
      scopeId,
    );
  }
  for (const [key, title, description] of capabilities) {
    const supplierOnboarding = key === 'supplier-onboarding';
    append(key, {
      type: 'capability',
      title,
      description,
      body: supplierOnboarding
        ? `${description}. North Works can reuse [Supplier Harbor North](./${demoIds.supplierProvider}.md) for registration and approval. Supplier Operations owns intake.`
        : description,
      lifecycle: 'active',
      owner: supplierOnboarding
        ? 'Supplier Operations'
        : 'Business Architecture',
      aliases: supplierOnboarding
        ? ['Vendor Registration', 'Supplier Intake']
        : [],
    });
  }
  for (const [key, title, description] of businessObjects) {
    append(key, {
      type: 'business-object',
      title,
      description,
      body: description,
      lifecycle: 'active',
      owner: 'Enterprise Data Stewardship',
    });
  }

  append(
    'procurement-project',
    {
      type: 'project',
      title: 'Procurement Modernization',
      description:
        'Replace North Works’ legacy ordering workflow and reuse supplier onboarding.',
      body: '## Current\n\nLedgerline North creates purchase orders and receives a nightly supplier feed.\n\n## Target\n\nIntroduce Purchase Desk North and reuse Supplier Harbor North for approved supplier lookup. Retire the nightly feed after rollout and reconciliation.',
      lifecycle: 'active',
      owner: 'North Procurement Program',
      aliases: ['North Works Purchasing Renewal'],
    },
    'procurement',
  );
  append(
    'integration-project',
    {
      type: 'project',
      title: 'Freight Event Integration',
      description:
        'Deliver replayable freight status events for Coastal Works.',
      body: 'Use the operating North Works event route as the pattern for Transfer Hub Coastal and Freight Link Coastal.',
      lifecycle: 'active',
      owner: 'Coastal Logistics Program',
      aliases: ['Coastal Freight Event Upgrade'],
    },
    'integration',
  );

  for (const edge of relationships) {
    append(
      edge.key,
      {
        type: 'relationship',
        title: edge.title,
        description: edge.description,
        body: edge.description,
        lifecycle: edge.proposed ? 'draft' : 'active',
        owner: edge.scopeId
          ? 'Project Architecture'
          : 'Enterprise Architecture',
        attributes: edge.proposed
          ? { ...edge.attributes, state: 'proposed' }
          : edge.attributes,
        relationship: {
          type: edge.type,
          sourceId: demoId(edge.source),
          targetId: demoId(edge.target),
        },
      },
      edge.scopeId,
    );
  }

  append('solution-context-viewpoint', {
    type: 'viewpoint',
    title: 'Solution Context Diagram',
    body: 'Shows project impacts, application installations and proposed or existing integrations.',
    lifecycle: 'active',
    attributes: { key: 'solution-context' },
  });
  append('business-object-map-viewpoint', {
    type: 'viewpoint',
    title: 'Application Instance Business Object Map',
    body: 'Shows create, read, update and master data responsibilities for application installations.',
    lifecycle: 'active',
    attributes: { key: 'business-object-map' },
  });
  append(
    'procurement-context',
    {
      type: 'view',
      title: 'Procurement Solution Context',
      description:
        'North Works proposal and operating baseline, with integrations shared from the catalog.',
      body: 'The solution would reuse Supplier Harbor North and introduce Purchase Desk North. An impact on the nightly feed records a planned retirement while the feed remains operational.',
      lifecycle: 'active',
      owner: 'North Procurement Program',
      view: modelView(
        'solution-context',
        [
          ['procurement-project', 70, 35],
          ['ledgerline-north', 75, 205],
          ['purchase-desk-north', 75, 345],
          ['supplier-harbor-north', 415, 225],
          ['legacy-supplier-sync', 560, 120],
          ['target-supplier-sync', 560, 335],
        ],
        [
          'legacy-supplier-sync',
          'target-supplier-sync',
          'procurement-impacts-purchase',
          'procurement-retires-legacy',
          'procurement-adds-supplier',
        ],
      ),
    },
    'procurement',
  );
  append('supplier-order-map', {
    type: 'view',
    title: 'Supplier and Order Data Responsibility',
    description:
      'Operational supplier and order responsibilities at North Works.',
    body: 'Supplier Harbor North creates and masters suppliers. Ledgerline North reads supplier records and creates and updates purchase orders.',
    lifecycle: 'active',
    owner: 'Enterprise Data Stewardship',
    view: modelView(
      'business-object-map',
      [
        ['supplier-harbor-north', 35, 55],
        ['ledgerline-north', 35, 225],
        ['supplier', 370, 55],
        ['purchase-order', 370, 225],
      ],
      [
        'harbor-creates-supplier',
        'harbor-masters-supplier',
        'erp-reads-supplier',
        'erp-creates-order',
        'erp-updates-order',
      ],
    ),
  });

  return documents;
}
