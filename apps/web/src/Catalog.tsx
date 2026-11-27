import { useInfiniteQuery } from '@tanstack/react-query';
import type {
  DemoIdentity,
  Metamodel,
  ModelSession,
} from '@archimesh/contracts';
import { listObjects, modelKey, type CatalogFilters } from './api';
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

export function Catalog({
  identity,
  filters,
  metamodel,
  session,
  canCreate,
  navigate,
  onCreate,
  onClear,
}: {
  identity: DemoIdentity;
  filters: CatalogFilters;
  metamodel: Metamodel | undefined;
  session: ModelSession | undefined;
  canCreate: boolean;
  navigate: Navigate;
  onCreate: () => void;
  onClear: () => void;
}) {
  const query = useInfiniteQuery({
    queryKey: [...modelKey(identity), 'catalog', filters],
    queryFn: ({ pageParam, signal }) =>
      listObjects(identity, filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(session),
  });
  const objects = query.data?.pages.flatMap((page) => page.items) ?? [];
  const currentType = metamodel?.entityTypes.find(
    (type) => type.id === filters.type,
  );
  const selectedScope = session?.scopes.find(
    (scope) => scope.id === filters.scopeId,
  );
  const title = filters.q
    ? 'Search results'
    : filters.type === 'view'
      ? 'Saved views'
      : (currentType?.label ??
        (filters.type ? label(filters.type) : 'All objects'));
  const typeLabel = (id: string) =>
    metamodel?.entityTypes.find((type) => type.id === id)?.label ?? label(id);

  return (
    <section className="catalog" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div>
          <div className="breadcrumbs">
            <Icon name="catalog" size={14} /> Repository{' '}
            <Icon name="chevron" size={12} />{' '}
            {selectedScope?.label ?? 'All workspaces'}
          </div>
          <h2 id="catalog-title">{title}</h2>
          {filters.q ? (
            <p>
              Matching “{filters.q}”
              {currentType && ` in ${currentType.label.toLowerCase()}`}
            </p>
          ) : (
            <p>
              {filters.type === 'view'
                ? 'Open a saved diagram or business object map.'
                : 'Browse architecture knowledge across the workspaces you can access.'}
            </p>
          )}
        </div>
        <button
          className="button primary"
          type="button"
          onClick={onCreate}
          disabled={!canCreate}
        >
          <Icon name="plus" />{' '}
          {filters.type === 'relationship'
            ? 'New relationship'
            : filters.type === 'view'
              ? 'New view'
              : 'New object'}
        </button>
      </div>
      <div className="catalog-panel">
        <div className="panel-bar">
          <div className="panel-label">
            <Icon name="catalog" size={16} /> <strong>Catalog</strong>
          </div>
          {!query.isPending && !query.isError && (
            <span className="muted">
              {objects.length} {objects.length === 1 ? 'object' : 'objects'}{' '}
              shown
            </span>
          )}
        </div>
        {query.isPending ? (
          <EmptyState title="Loading the catalog…" />
        ) : query.isError && !objects.length ? (
          <EmptyState title="Could not load the catalog" error>
            <p>
              {displayError(
                query.error,
                'The repository did not return catalog results.',
              )}
            </p>
            <button
              className="button"
              type="button"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </EmptyState>
        ) : !objects.length ? (
          <EmptyState title="No matching objects">
            <p>
              {filters.q || filters.type || filters.scopeId
                ? 'Change the query, catalog, or workspace to broaden the results.'
                : 'Create an object or load the synthetic model to get started.'}
            </p>
            {(filters.q || filters.type || filters.scopeId) && (
              <button className="button" onClick={onClear} type="button">
                Clear filters
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Status</th>
                    <th scope="col">Workspace</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {objects.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">
                        <LocalLink
                          className="catalog-object"
                          to={objectUrl(item.id)}
                          navigate={navigate}
                        >
                          <TypeIcon type={item.type} />
                          <span>
                            <strong>{item.title}</strong>
                            {item.description && (
                              <small title={item.description}>
                                {item.description}
                              </small>
                            )}
                          </span>
                        </LocalLink>
                      </th>
                      <td>
                        {item.relationship
                          ? label(item.relationship.type)
                          : typeLabel(item.type)}
                      </td>
                      <td>
                        <span
                          className="lifecycle"
                          data-lifecycle={item.lifecycle}
                        >
                          {item.retired ? 'Retired' : label(item.lifecycle)}
                        </span>
                      </td>
                      <td>
                        {session?.scopes.find(
                          (scope) => scope.id === item.scopeId,
                        )?.label ?? label(item.scopeId)}
                      </td>
                      <td>
                        <time dateTime={item.updatedAt}>
                          {dateLabel(item.updatedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(query.hasNextPage || query.isFetchNextPageError) && (
              <div className="catalog-pagination">
                {query.isFetchNextPageError && (
                  <span role="alert">Could not load the next page.</span>
                )}
                <button
                  type="button"
                  className="button"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
