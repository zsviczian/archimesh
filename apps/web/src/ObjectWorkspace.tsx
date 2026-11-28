import { useQuery } from '@tanstack/react-query';
import type {
  DemoIdentity,
  Metamodel,
  ModelObject,
  ModelSession,
  ModelSummary,
} from '@archimesh/contracts';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  getObject,
  getViewObjects,
  history,
  modelKey,
  neighborhood,
  neighborhoodKey,
  objectKey,
} from './api';
import { makeViewGraph } from './graph';
import { type EditorTarget } from './Editor';
import {
  dateLabel,
  displayError,
  EmptyState,
  Icon,
  label,
  LocalLink,
  type Navigate,
  objectPathId,
  objectUrl,
  TypeIcon,
} from './ui';

const Markdown = lazy(() => import('react-markdown'));
const GraphPanel = lazy(() =>
  import('./GraphPanel').then(({ GraphPanel }) => ({ default: GraphPanel })),
);

type ViewMode = 'document' | 'graph';

export function ObjectWorkspace({
  id,
  revision,
  mode,
  identity,
  session,
  metamodel,
  navigate,
  onEdit,
  onChanged,
  theme,
}: {
  id: string;
  revision?: string;
  mode: ViewMode;
  identity: DemoIdentity;
  session: ModelSession | undefined;
  metamodel: Metamodel | undefined;
  navigate: Navigate;
  onEdit: (target: EditorTarget) => void;
  onChanged: () => void;
  theme: 'dark' | 'light';
}) {
  const query = useQuery({
    queryKey: objectKey(identity, id, revision),
    queryFn: ({ signal }) => getObject(identity, id, revision, signal),
    enabled: Boolean(session),
  });
  if (query.isPending) return <EmptyState title="Loading object…" />;
  if (query.isError) {
    return (
      <EmptyState title="Object unavailable" error>
        <p>
          {displayError(
            query.error,
            'The repository did not return this object.',
          )}
        </p>
        <LocalLink className="button" to="/" navigate={navigate}>
          <Icon name="back" /> Back to catalog
        </LocalLink>
      </EmptyState>
    );
  }
  const object = query.data;
  const scope = session?.scopes.find((item) => item.id === object.scopeId);
  return (
    <ObjectPage
      key={`${object.id}:${revision ?? 'current'}`}
      object={object}
      historical={Boolean(revision)}
      mode={mode}
      identity={identity}
      scope={scope}
      canEdit={Boolean(metamodel)}
      typeLabel={
        metamodel?.entityTypes.find((type) => type.id === object.type)?.label ??
        label(object.type)
      }
      navigate={navigate}
      onEdit={onEdit}
      onChanged={onChanged}
      theme={theme}
    />
  );
}

function ObjectPage({
  object,
  historical,
  mode,
  identity,
  scope,
  canEdit,
  typeLabel,
  navigate,
  onEdit,
  onChanged,
  theme,
}: {
  object: ModelObject;
  historical: boolean;
  mode: ViewMode;
  identity: DemoIdentity;
  scope: ModelSession['scopes'][number] | undefined;
  canEdit: boolean;
  typeLabel: string;
  navigate: Navigate;
  onEdit: (target: EditorTarget) => void;
  onChanged: () => void;
  theme: 'dark' | 'light';
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus({ preventScroll: true }), []);
  const view = object.view;
  const neighbors = useQuery({
    queryKey: neighborhoodKey(identity, object.id),
    queryFn: ({ signal }) => neighborhood(identity, object.id, signal),
    enabled: !historical && !object.retired,
  });
  const viewObjects = useQuery({
    queryKey: [...modelKey(identity), 'view', object.id, object.revisionId],
    queryFn: ({ signal }) =>
      view ? getViewObjects(identity, view, signal) : Promise.resolve([]),
    enabled: Boolean(
      view && !historical && !object.retired && mode === 'graph',
    ),
  });
  const writable = Boolean(
    canEdit && scope?.writable && !historical && !object.retired,
  );
  const graphUrl = `${objectUrl(object.id)}?mode=graph`;
  const isGraph = mode === 'graph' && !historical && !object.retired;
  const graph = useMemo(
    () =>
      view && viewObjects.data
        ? makeViewGraph(view, viewObjects.data)
        : neighbors.data,
    [view, viewObjects.data, neighbors.data],
  );
  const graphQuery = view ? viewObjects : neighbors;
  const allowed = new Set([
    object.id,
    ...(neighbors.data?.nodes.map((item) => item.id) ?? []),
    ...(neighbors.data?.edges.map((item) => item.id) ?? []),
  ]);
  return (
    <div className="document-layout">
      <section className="object-section" aria-labelledby="object-title">
        <div className="section-heading object-heading">
          <div>
            <div className="breadcrumbs">
              <LocalLink to="/" navigate={navigate}>
                <Icon name="back" size={14} /> Catalog
              </LocalLink>
              <Icon name="chevron" size={12} />{' '}
              {scope?.label ?? label(object.scopeId)}
            </div>
            <div className="object-title-line">
              <TypeIcon type={object.type} />
              <h2 id="object-title" tabIndex={-1} ref={title}>
                {object.title}
              </h2>
            </div>
            <p>
              {typeLabel} <span aria-hidden="true">·</span>{' '}
              {object.retired ? 'Retired' : label(object.lifecycle)}
              {view && ` · ${label(view.viewpoint)}`}
            </p>
          </div>
          {writable && (
            <button
              className="button"
              type="button"
              onClick={() => onEdit({ kind: 'update', object })}
            >
              <Icon name="edit" /> Edit Markdown
            </button>
          )}
        </div>
        {historical && (
          <div className="history-banner">
            <Icon name="history" />{' '}
            <span>Historical revision · {dateLabel(object.updatedAt)}</span>
            <LocalLink to={objectUrl(object.id)} navigate={navigate}>
              Open current revision <Icon name="arrow" size={13} />
            </LocalLink>
          </div>
        )}
        <div className="document-tabs">
          <LocalLink
            to={objectUrl(
              object.id,
              historical ? object.revisionId : undefined,
            )}
            navigate={navigate}
            ariaCurrent={isGraph ? undefined : 'page'}
          >
            <Icon name="document" size={16} /> Document
          </LocalLink>
          {!historical && !object.retired && (
            <LocalLink
              to={graphUrl}
              navigate={navigate}
              ariaCurrent={isGraph ? 'page' : undefined}
            >
              <Icon name={view ? 'view' : 'relationship'} size={16} />{' '}
              {view ? 'Model diagram' : 'Explore graph'}
            </LocalLink>
          )}
        </div>
        {isGraph ? (
          graphQuery.isPending ? (
            <EmptyState title="Loading graph…" />
          ) : graphQuery.isError || !graph ? (
            <EmptyState title="Graph unavailable" error>
              <p>
                {displayError(
                  graphQuery.error,
                  'The graph could not be loaded.',
                )}
              </p>
              <button
                className="button"
                type="button"
                onClick={() => void graphQuery.refetch()}
              >
                Try again
              </button>
            </EmptyState>
          ) : (
            <Suspense fallback={<EmptyState title="Loading diagram tools…" />}>
              <GraphPanel
                key={`${object.id}:${object.revisionId}`}
                graph={graph}
                object={object}
                identity={identity}
                writable={writable}
                navigate={navigate}
                onSaved={onChanged}
                theme={theme}
              />
            </Suspense>
          )
        ) : (
          <div className="document-content">
            {object.description && (
              <p className="document-summary">{object.description}</p>
            )}
            {object.body.trim() ? (
              <div className="markdown">
                <Suspense fallback={<p className="muted">Loading Markdown…</p>}>
                  <Markdown
                    skipHtml
                    components={{
                      a({ href, children }) {
                        const direct = objectPathId(href);
                        const file =
                          /^\.?\.?\/?(?:[a-z0-9_-]+\/)*([0-9a-f-]+)\.md$/i.exec(
                            href ?? '',
                          )?.[1];
                        const target = direct ?? file;
                        return target && allowed.has(target) ? (
                          <LocalLink to={objectUrl(target)} navigate={navigate}>
                            {children}
                          </LocalLink>
                        ) : (
                          <span>{children}</span>
                        );
                      },
                      img({ alt }) {
                        return alt ? <span>[Image: {alt}]</span> : null;
                      },
                    }}
                  >
                    {object.body}
                  </Markdown>
                </Suspense>
              </div>
            ) : !object.description ? (
              <p className="muted document-empty">
                This object has no Markdown body yet.
              </p>
            ) : null}
            {object.relationship && (
              <div className="relationship-detail">
                <h3>Endpoints</h3>
                <EndpointLink
                  id={object.relationship.sourceId}
                  current={object}
                  identity={identity}
                  navigate={navigate}
                />
                <span className="endpoint-arrow">
                  <Icon name="arrow" size={14} />
                  {label(object.relationship.type)}
                </span>
                <EndpointLink
                  id={object.relationship.targetId}
                  current={object}
                  identity={identity}
                  navigate={navigate}
                />
              </div>
            )}
            {writable && (
              <details className="record-actions">
                <summary>Record actions</summary>
                <button
                  className="button subtle"
                  type="button"
                  onClick={() => onEdit({ kind: 'retire', object })}
                >
                  Retire object
                </button>
              </details>
            )}
          </div>
        )}
      </section>
      <Inspector
        object={object}
        historical={historical}
        identity={identity}
        workspace={scope?.label}
        neighbors={neighbors.data?.edges ?? []}
        neighborError={neighbors.isError}
        neighborLoading={neighbors.isPending && !historical && !object.retired}
        navigate={navigate}
        onAddRelationship={
          writable
            ? () =>
                onEdit({
                  kind: 'create',
                  type: 'relationship',
                  scopeId: object.scopeId,
                  source: object,
                })
            : undefined
        }
      />
    </div>
  );
}

function EndpointLink({
  id,
  current,
  identity,
  navigate,
}: {
  id: string;
  current: ModelObject;
  identity: DemoIdentity;
  navigate: Navigate;
}) {
  const query = useQuery({
    queryKey: objectKey(identity, id),
    queryFn: ({ signal }) => getObject(identity, id, undefined, signal),
    enabled: id !== current.id,
  });
  const object = id === current.id ? current : query.data;
  return object ? (
    <LocalLink className="endpoint-link" to={objectUrl(id)} navigate={navigate}>
      <TypeIcon type={object.type} />
      {object.title}
    </LocalLink>
  ) : (
    <span className="muted">
      {query.isPending ? 'Loading endpoint…' : 'Endpoint unavailable'}
    </span>
  );
}

function Inspector({
  object,
  historical,
  identity,
  workspace,
  neighbors,
  neighborError,
  neighborLoading,
  navigate,
  onAddRelationship,
}: {
  object: ModelObject;
  historical: boolean;
  identity: DemoIdentity;
  workspace?: string;
  neighbors: ModelSummary[];
  neighborError: boolean;
  neighborLoading: boolean;
  navigate: Navigate;
  onAddRelationship?: () => void;
}) {
  const [tab, setTab] = useState<'properties' | 'relationships' | 'history'>(
    'properties',
  );
  const revisions = useQuery({
    queryKey: [...modelKey(identity), 'history', object.id],
    queryFn: ({ signal }) => history(identity, object.id, signal),
    enabled: tab === 'history',
  });
  const properties: [string, string][] = [
    ['Workspace', workspace ?? label(object.scopeId)],
    ['Type', label(object.type)],
    ['Lifecycle', object.retired ? 'Retired' : label(object.lifecycle)],
    ['Owner', object.owner ?? 'Unassigned'],
    ['Updated', dateLabel(object.updatedAt)],
  ];
  if (object.aliases.length)
    properties.push(['Aliases', object.aliases.join(', ')]);
  if (object.view) properties.push(['Viewpoint', label(object.view.viewpoint)]);
  const relationList = neighbors.filter(
    (candidate) => candidate.id !== object.id,
  );
  return (
    <aside className="inspector" aria-label="Object inspector">
      <div className="inspector-heading">
        <Icon name="document" /> <h3>Inspector</h3>
      </div>
      <div className="inspector-tabs">
        {(['properties', 'relationships', 'history'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {label(item)}
          </button>
        ))}
      </div>
      {tab === 'properties' && (
        <div className="inspector-body">
          <dl className="property-list">
            {properties.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {Object.keys(object.attributes).length > 0 && (
            <>
              <h4>Attributes</h4>
              <dl className="property-list attributes">
                {Object.entries(object.attributes).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      {typeof value === 'string'
                        ? value
                        : JSON.stringify(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <h4>Identifiers</h4>
          <dl className="property-list identifiers">
            <div>
              <dt>Object ID</dt>
              <dd>
                <code>{object.id}</code>
              </dd>
            </div>
            <div>
              <dt>Revision ID</dt>
              <dd>
                <code>{object.revisionId}</code>
              </dd>
            </div>
          </dl>
        </div>
      )}
      {tab === 'relationships' && (
        <div className="inspector-body">
          {onAddRelationship && (
            <button
              className="button"
              type="button"
              onClick={onAddRelationship}
            >
              <Icon name="plus" size={15} /> Add relationship
            </button>
          )}
          {historical || object.retired ? (
            <p className="muted">
              Open an active current revision to explore relationships.
            </p>
          ) : neighborLoading ? (
            <p className="muted">Loading relationships…</p>
          ) : neighborError ? (
            <p className="muted">Relationships could not be loaded.</p>
          ) : relationList.length ? (
            <ul className="inspector-list">
              {relationList.map((item) => (
                <li key={item.id}>
                  <LocalLink to={objectUrl(item.id)} navigate={navigate}>
                    <TypeIcon type="relationship" />
                    <span>
                      <strong>{item.title}</strong>
                      {item.relationship && (
                        <small>{label(item.relationship.type)}</small>
                      )}
                    </span>
                  </LocalLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No relationships in this neighborhood.</p>
          )}
        </div>
      )}
      {tab === 'history' && (
        <div className="inspector-body">
          {revisions.isPending ? (
            <p className="muted">Loading revision history…</p>
          ) : revisions.isError ? (
            <p role="alert">
              {displayError(revisions.error, 'History could not be loaded.')}
            </p>
          ) : revisions.data.length ? (
            <ul className="inspector-list">
              {revisions.data.map((revision) => (
                <li key={revision.id}>
                  <LocalLink
                    to={objectUrl(object.id, revision.id)}
                    navigate={navigate}
                    ariaCurrent={
                      revision.id === object.revisionId ? 'page' : undefined
                    }
                  >
                    <Icon name="history" />
                    <span>
                      <strong>{dateLabel(revision.recordedAt)}</strong>
                      <small>
                        {revision.actor} · {revision.id.slice(0, 8)}
                      </small>
                      <small>
                        Effective {dateLabel(revision.effectiveFrom)}
                        {revision.effectiveTo &&
                          ` to ${dateLabel(revision.effectiveTo)}`}
                        {revision.retired && ' · Retired'}
                      </small>
                    </span>
                  </LocalLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No revisions are available.</p>
          )}
        </div>
      )}
    </aside>
  );
}
