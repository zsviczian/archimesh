import { useMutation } from '@tanstack/react-query';
import {
  Background,
  BaseEdge,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/style.css';
import type {
  DemoIdentity,
  ModelObject,
  ModelSummary,
  ModelView,
} from '@archimesh/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { updateLayout } from './api';
import { completeLinks, type Graph, type Link } from './graph';
import {
  displayError,
  EmptyState,
  Icon,
  label,
  LocalLink,
  type Navigate,
  objectUrl,
  TypeIcon,
} from './ui';

type FlowData = { label: React.JSX.Element };
type NodePositions = ModelView['positions'];
type MeshEdge = Edge<{ bend: number }>;

function ParallelEdge(props: EdgeProps<MeshEdge>) {
  const { sourceX, sourceY, targetX, targetY } = props;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const scale = Math.hypot(dx, dy) || 1;
  const bend = props.data?.bend ?? 0;
  const centerX = (sourceX + targetX) / 2 - (dy / scale) * bend;
  const centerY = (sourceY + targetY) / 2 + (dx / scale) * bend;
  return (
    <BaseEdge
      path={`M ${sourceX},${sourceY} Q ${centerX},${centerY} ${targetX},${targetY}`}
      label={props.label}
      labelX={(sourceX + 2 * centerX + targetX) / 4}
      labelY={(sourceY + 2 * centerY + targetY) / 4}
      markerEnd={props.markerEnd}
      style={props.style}
    />
  );
}

const edgeTypes = { parallel: ParallelEdge };

const phases = {
  existing: { label: 'Existing', color: 'var(--muted)', dash: undefined },
  proposed: { label: 'Proposed', color: 'var(--accent)', dash: '6 4' },
  change: { label: 'Proposed change', color: 'var(--warning)', dash: '5 4' },
  retirement: {
    label: 'Proposed retirement',
    color: 'var(--danger)',
    dash: '3 4',
  },
};

function phase(link: Link, solutionContext: boolean) {
  if (!solutionContext) return phases.existing;
  if (link.attributes?.change === 'retire') return phases.retirement;
  if (link.attributes?.change === 'modify') return phases.change;
  return link.lifecycle === 'active' ? phases.existing : phases.proposed;
}

function makeEdges(links: Link[], solutionContext: boolean): MeshEdge[] {
  const groups = new Map<string, Link[]>();
  for (const link of links) {
    const { sourceId, targetId } = link.relationship;
    const key = [sourceId, targetId].sort().join(':');
    const group = groups.get(key) ?? [];
    group.push(link);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) =>
    group.map((link, index) => {
      const { type, sourceId, targetId } = link.relationship;
      const status = phase(link, solutionContext);
      const direction = sourceId < targetId ? 1 : -1;
      return {
        id: link.id,
        source: sourceId,
        target: targetId,
        label: label(type),
        ariaLabel: link.title,
        type: group.length > 1 ? 'parallel' : 'smoothstep',
        data: { bend: (index - (group.length - 1) / 2) * 66 * direction },
        style: { stroke: status.color, strokeDasharray: status.dash },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        reconnectable: false,
      };
    }),
  );
}

function makeNodes(
  graph: Graph,
  focus: string,
  annotateLifecycle: boolean,
  positions?: NodePositions,
): Node<FlowData>[] {
  const nodes = [...graph.nodes].sort(
    (a, b) =>
      Number(b.id === focus) - Number(a.id === focus) ||
      a.type.localeCompare(b.type) ||
      a.title.localeCompare(b.title),
  );
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(nodes.length))));
  return nodes.map((node, index) => ({
    id: node.id,
    ariaLabel: node.title,
    data: {
      label: (
        <span className="flow-node-content" title={node.title}>
          <TypeIcon type={node.type} />
          <span>
            <small>
              {label(node.type)}
              {annotateLifecycle ? ` · ${label(node.lifecycle)}` : ''}
            </small>
            <strong>{node.title}</strong>
          </span>
        </span>
      ),
    },
    className: [
      'model-flow-node',
      node.id === focus && 'focused',
      annotateLifecycle && node.lifecycle !== 'active' && 'proposed-node',
    ]
      .filter(Boolean)
      .join(' '),
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    position: positions?.[node.id] ?? {
      x: (index % columns) * 264,
      y: Math.floor(index / columns) * 112,
    },
  }));
}

export function GraphPanel({
  graph,
  object,
  identity,
  writable,
  navigate,
  onSaved,
  theme,
}: {
  graph: Graph;
  object: ModelObject;
  identity: DemoIdentity;
  writable: boolean;
  navigate: Navigate;
  onSaved: () => void;
  theme: 'dark' | 'light';
}) {
  const [relationshipType, setRelationshipType] = useState('');
  const [direction, setDirection] = useState('all');
  const [mode, setMode] = useState<'diagram' | 'matrix'>('diagram');
  const solutionContext = object.view?.viewpoint === 'solution-context';
  const baselineNodes = useMemo(
    () => makeNodes(graph, object.id, solutionContext, object.view?.positions),
    [graph, object.id, object.view?.positions, solutionContext],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(baselineNodes);
  useEffect(() => {
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return baselineNodes.map((node) => {
        const existing = previous.get(node.id);
        return existing
          ? { ...existing, ...node, position: existing.position }
          : node;
      });
    });
  }, [baselineNodes, setNodes]);
  const layoutRequest = useRef<{ signature: string; requestId: string } | null>(
    null,
  );
  const links = useMemo(() => completeLinks(graph), [graph]);
  const types = [
    ...new Set(links.map((item) => item.relationship.type)),
  ].sort();
  const isSaved = Boolean(object.view);
  const canMove = isSaved && writable && !graph.partial;
  const visibleLinks = links.filter(
    (item) =>
      (!relationshipType || item.relationship.type === relationshipType) &&
      (direction === 'all' ||
        (direction === 'out'
          ? item.relationship.sourceId
          : item.relationship.targetId) === object.id),
  );
  const filtering = Boolean(relationshipType) || direction !== 'all';
  const activeIds = new Set([
    object.id,
    ...visibleLinks.flatMap((item) => [
      item.relationship.sourceId,
      item.relationship.targetId,
    ]),
  ]);
  const graphNodes = filtering
    ? nodes.map((node) => ({ ...node, hidden: !activeIds.has(node.id) }))
    : nodes;
  const actualPositions = Object.fromEntries(
    nodes.map((node) => [node.id, node.position]),
  );
  const changed = baselineNodes.some(
    ({ id, position }) =>
      position.x !== actualPositions[id]?.x ||
      position.y !== actualPositions[id]?.y,
  );
  const edges = makeEdges(visibleLinks, solutionContext);
  const visiblePhases = [
    ...new Set(visibleLinks.map((link) => phase(link, solutionContext))),
  ];
  const saveLayout = useMutation({
    mutationFn: () => {
      const positions = Object.fromEntries(
        nodes.map((node) => [
          node.id,
          {
            x: Math.max(-10000, Math.min(10000, Math.round(node.position.x))),
            y: Math.max(-10000, Math.min(10000, Math.round(node.position.y))),
          },
        ]),
      );
      const signature = JSON.stringify(positions);
      if (layoutRequest.current?.signature !== signature) {
        layoutRequest.current = { signature, requestId: crypto.randomUUID() };
      }
      return updateLayout(identity, object.id, {
        expectedRevisionId: object.revisionId,
        positions,
        requestId: layoutRequest.current.requestId,
      });
    },
    onSuccess: onSaved,
  });

  if (!graph.nodes.length)
    return (
      <EmptyState title="No objects in this graph">
        <p>
          Reference reusable objects in the view document to populate the
          diagram.
        </p>
      </EmptyState>
    );

  return (
    <section
      className="graph-panel"
      aria-label={isSaved ? 'Saved view graph' : 'Relationship graph'}
    >
      <div className="graph-toolbar">
        <div className="segmented">
          <button
            type="button"
            aria-pressed={mode === 'diagram'}
            onClick={() => setMode('diagram')}
          >
            Diagram
          </button>
          {object.view?.viewpoint === 'business-object-map' && (
            <button
              type="button"
              aria-pressed={mode === 'matrix'}
              onClick={() => setMode('matrix')}
            >
              Matrix
            </button>
          )}
        </div>
        <div className="toolbar-fields">
          <label className="sr-only" htmlFor="graph-relationship">
            Relationship lens
          </label>
          <select
            id="graph-relationship"
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value)}
          >
            <option value="">All relationship types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {label(type)}
              </option>
            ))}
          </select>
          {!isSaved && (
            <>
              <label className="sr-only" htmlFor="graph-direction">
                Relationship direction
              </label>
              <select
                id="graph-direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="all">Both directions</option>
                <option value="in">Inbound</option>
                <option value="out">Outbound</option>
              </select>
            </>
          )}
        </div>
      </div>
      {mode === 'matrix' ? (
        <BusinessMatrix
          nodes={graph.nodes}
          edges={visibleLinks}
          navigate={navigate}
        />
      ) : (
        <div className="flow-canvas">
          <ReactFlow
            nodes={graphNodes}
            edges={edges}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              if (!canMove) navigate(objectUrl(node.id));
            }}
            onNodeDoubleClick={(_, node) => navigate(objectUrl(node.id))}
            onEdgeClick={(_, edge) => navigate(objectUrl(edge.id))}
            nodesDraggable={canMove && !saveLayout.isPending}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            forceColorMode={theme}
            fitView
            fitViewOptions={{ minZoom: 0.25, maxZoom: 1, padding: 40 }}
            minZoom={0.15}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
      <div className="graph-footer">
        <span>
          {graphNodes.filter((node) => !node.hidden).length} objects ·{' '}
          {edges.length} relationships{graph.partial && ' · Bounded results'}
        </span>
        {canMove && mode === 'diagram' && (
          <div className="layout-actions">
            <button
              className="button subtle"
              type="button"
              onClick={() => {
                setNodes(makeNodes(graph, object.id, solutionContext));
              }}
              disabled={saveLayout.isPending}
            >
              Arrange
            </button>
            <button
              className="button"
              type="button"
              onClick={() => saveLayout.mutate()}
              disabled={!changed || saveLayout.isPending}
            >
              {saveLayout.isPending ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        )}
      </div>
      {solutionContext && visiblePhases.length > 0 && mode === 'diagram' && (
        <ul className="graph-legend" aria-label="Relationship phase legend">
          {visiblePhases.map((item) => (
            <li key={item.label}>
              <span
                aria-hidden="true"
                style={{
                  borderColor: item.color,
                  borderTopStyle: item.dash ? 'dashed' : 'solid',
                }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {saveLayout.isError && (
        <p className="inline-error" role="alert">
          {displayError(saveLayout.error, 'The layout could not be saved.')}
        </p>
      )}
      <details className="diagram-index">
        <summary>Diagram objects and relationships</summary>
        <ul>
          {graph.nodes
            .filter((node) => !filtering || activeIds.has(node.id))
            .map((node) => (
              <li key={node.id}>
                <LocalLink to={objectUrl(node.id)} navigate={navigate}>
                  <TypeIcon type={node.type} />
                  {node.title}
                </LocalLink>
              </li>
            ))}
          {visibleLinks.map((edge) => (
            <li key={edge.id}>
              <LocalLink to={objectUrl(edge.id)} navigate={navigate}>
                <Icon name="relationship" />
                {edge.title}
              </LocalLink>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function BusinessMatrix({
  nodes,
  edges,
  navigate,
}: {
  nodes: ModelSummary[];
  edges: Link[];
  navigate: Navigate;
}) {
  const apps = nodes.filter((node) => node.type === 'application-instance');
  const objects = nodes.filter((node) => node.type === 'business-object');
  if (!apps.length || !objects.length)
    return (
      <EmptyState title="No application instances or business objects in this view" />
    );
  return (
    <div className="table-scroll matrix-scroll">
      <table className="catalog-table matrix-table">
        <thead>
          <tr>
            <th scope="col">Application instance</th>
            {objects.map((item) => (
              <th key={item.id} scope="col">
                <LocalLink to={objectUrl(item.id)} navigate={navigate}>
                  {item.title}
                </LocalLink>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id}>
              <th scope="row">
                <LocalLink to={objectUrl(app.id)} navigate={navigate}>
                  {app.title}
                </LocalLink>
              </th>
              {objects.map((item) => {
                const matches = edges.filter((edge) => {
                  const { sourceId, targetId } = edge.relationship;
                  return (
                    (sourceId === app.id && targetId === item.id) ||
                    (sourceId === item.id && targetId === app.id)
                  );
                });
                return (
                  <td key={item.id}>
                    {matches.length ? (
                      matches.map((edge) => (
                        <LocalLink
                          key={edge.id}
                          className="matrix-link"
                          to={objectUrl(edge.id)}
                          navigate={navigate}
                          title={edge.title}
                        >
                          {label(edge.relationship.type)}
                        </LocalLink>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
