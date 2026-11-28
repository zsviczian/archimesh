import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { DemoIdentity, ModelSession } from '@archimesh/contracts';
import { getScenario, listScenarios, modelKey } from './api';
import {
  dateLabel,
  displayError,
  EmptyState,
  Icon,
  label,
  LocalLink,
  type Navigate,
  objectUrl,
  TypeIcon,
} from './ui';

const proposalLabels = {
  add: 'Proposed addition',
  change: 'Proposed change',
  retire: 'Proposed retirement',
} as const;

function recordedTime(value: string) {
  return (
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  );
}

const scenarioUrl = (id: string) => `/scenarios/${encodeURIComponent(id)}`;

export function ScenarioWorkspace({
  id,
  identity,
  session,
  navigate,
}: {
  id?: string;
  identity: DemoIdentity;
  session: ModelSession | undefined;
  navigate: Navigate;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const list = useQuery({
    queryKey: [...modelKey(identity), 'scenarios'],
    queryFn: ({ signal }) => listScenarios(identity, signal),
    enabled: Boolean(session && !id),
  });
  const detail = useQuery({
    queryKey: [...modelKey(identity), 'scenarios', id],
    queryFn: ({ signal }) =>
      id
        ? getScenario(identity, id, signal)
        : Promise.reject(new Error('Select a scenario.')),
    enabled: Boolean(session && id),
  });
  const scope = (id: string) =>
    session?.scopes.find((item) => item.id === id)?.label ?? label(id);

  useEffect(
    () => title.current?.focus({ preventScroll: true }),
    [id, list.isSuccess, detail.isSuccess],
  );

  if (!id) {
    const items = list.data ?? [];
    return (
      <section
        className="catalog scenario-page"
        aria-labelledby="scenario-title"
      >
        <div className="section-heading">
          <div>
            <div className="breadcrumbs">
              <Icon name="project" size={14} /> Planning
            </div>
            <h2 id="scenario-title" tabIndex={-1} ref={title}>
              Scenarios
            </h2>
            <p>
              Review draft architecture proposals against their recorded
              baseline.
            </p>
          </div>
        </div>
        <div className="catalog-panel">
          {list.isPending ? (
            <EmptyState title="Loading scenarios…" />
          ) : list.isError ? (
            <EmptyState title="Scenarios unavailable" error>
              <p>
                {displayError(
                  list.error,
                  'The repository did not return scenarios.',
                )}
              </p>
            </EmptyState>
          ) : items.length ? (
            <div className="table-scroll">
              <table className="catalog-table scenario-table">
                <thead>
                  <tr>
                    <th scope="col">Proposal</th>
                    <th scope="col">Workspace</th>
                    <th scope="col">Baseline recorded at</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">
                        <LocalLink
                          className="catalog-object"
                          to={scenarioUrl(item.id)}
                          navigate={navigate}
                        >
                          <TypeIcon type="project" />
                          <strong>{item.name}</strong>
                        </LocalLink>
                      </th>
                      <td>{scope(item.scopeId)}</td>
                      <td>
                        <time dateTime={item.baseRecordedAt}>
                          {recordedTime(item.baseRecordedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No accessible scenarios" />
          )}
        </div>
      </section>
    );
  }

  if (detail.isPending) return <EmptyState title="Loading scenario…" />;
  if (detail.isError)
    return (
      <EmptyState title="Scenario unavailable" error>
        <p>
          {displayError(
            detail.error,
            'The repository did not return this scenario.',
          )}
        </p>
        <LocalLink className="button" to="/scenarios" navigate={navigate}>
          Scenarios
        </LocalLink>
      </EmptyState>
    );
  const scenario = detail.data;
  return (
    <section
      className="object-section scenario-page"
      aria-labelledby="scenario-title"
    >
      <div className="section-heading">
        <div>
          <div className="breadcrumbs">
            <LocalLink to="/scenarios" navigate={navigate}>
              <Icon name="back" size={14} /> Scenarios
            </LocalLink>
            <Icon name="chevron" size={12} /> {scope(scenario.scopeId)}
          </div>
          <h2 id="scenario-title" tabIndex={-1} ref={title}>
            {scenario.name}
          </h2>
          <p>
            Draft proposal · Baseline recorded{' '}
            <time dateTime={scenario.baseRecordedAt}>
              {recordedTime(scenario.baseRecordedAt)}
            </time>
          </p>
        </div>
      </div>
      {!scenario.changes.length ? (
        <EmptyState title="No proposed changes" />
      ) : (
        <ul className="scenario-changes" aria-label="Proposed changes">
          {scenario.changes.map((change) => (
            <li className="catalog-panel" key={change.id}>
              <div className="panel-bar">
                <div className="panel-label">
                  <TypeIcon
                    type={
                      change.after?.type ?? change.before?.type ?? 'project'
                    }
                  />
                  <strong>
                    {change.after?.title ??
                      change.before?.title ??
                      'Architecture object'}
                  </strong>
                </div>
                <span className="lifecycle" data-change={change.kind}>
                  {proposalLabels[change.kind]}
                </span>
              </div>
              <div className="scenario-comparison">
                <div>
                  <h3>Recorded baseline</h3>
                  {change.before ? (
                    <>
                      <LocalLink
                        className="scenario-link"
                        to={objectUrl(change.id, change.before.revisionId)}
                        navigate={navigate}
                      >
                        {change.before.title} <Icon name="arrow" size={14} />
                      </LocalLink>
                      <p className="muted">
                        {label(change.before.type)} ·{' '}
                        {label(change.before.lifecycle)}
                      </p>
                    </>
                  ) : (
                    <p className="muted">New object</p>
                  )}
                </div>
                <div>
                  <h3>Proposed state</h3>
                  {change.after ? (
                    <>
                      <p>{change.after.title}</p>
                      <p className="muted">
                        {label(change.after.type)} ·{' '}
                        {label(change.after.lifecycle)}
                        {change.after.relationship &&
                          ` · ${label(change.after.relationship.type)}`}
                      </p>
                      <p className="muted">
                        Effective {dateLabel(change.after.effectiveFrom)}
                        {change.after.effectiveTo &&
                          ` to ${dateLabel(change.after.effectiveTo)}`}
                      </p>
                    </>
                  ) : (
                    <p className="muted">Retire this object in the proposal.</p>
                  )}
                </div>
              </div>
              {change.after && (
                <details className="diagram-index scenario-source">
                  <summary>Proposed Markdown</summary>
                  <pre>{change.after.markdown}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
