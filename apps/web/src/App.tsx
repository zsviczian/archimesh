import {
  identitySchema,
  uuidSchema,
  type BrowserAuthStatus,
  type DemoIdentity,
  type Metamodel,
  type ModelSession,
} from '@archimesh/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  browserAuth,
  browserAuthKey,
  health,
  metamodel,
  modelKey,
  session,
  signOut,
} from './api';
import { SignIn } from './SignIn';
import { Catalog } from './Catalog';
import { Editor, type EditorTarget } from './Editor';
import { ObjectWorkspace } from './ObjectWorkspace';
import { ScenarioWorkspace } from './ScenarioWorkspace';
import {
  displayError,
  EmptyState,
  Icon,
  LocalLink,
  objectPathId,
  objectUrl,
  TypeIcon,
  type Navigate,
} from './ui';

const identities: Record<DemoIdentity, string> = {
  architect: 'Architect',
  'contractor-procurement': 'Procurement contractor',
  'contractor-integration': 'Integration contractor',
};
const identityStorageKey = 'archimesh.identity';
const themeStorageKey = 'archimesh.theme';

function useLocation() {
  const current = () => window.location.pathname + window.location.search;
  const [path, setPath] = useState(current);
  useEffect(() => {
    const onPop = () => setPath(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback<Navigate>((next) => {
    if (current() === next) return;
    window.history.pushState(null, '', next);
    setPath(next);
    window.scrollTo(0, 0);
  }, []);
  return { path, navigate };
}

export default function App() {
  const queryClient = useQueryClient();
  const { path, navigate } = useLocation();
  const [identity, setIdentity] = useState<DemoIdentity>(
    () =>
      identitySchema.safeParse(sessionStorage.getItem(identityStorageKey))
        .data ?? 'architect',
  );
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem(themeStorageKey) === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const auth = useQuery({
    queryKey: browserAuthKey,
    queryFn: ({ signal }) => browserAuth(signal),
    refetchInterval: 30_000,
    retry: false,
  });
  function applyAccess(value: BrowserAuthStatus) {
    queryClient.removeQueries({ queryKey: ['model'] });
    queryClient.setQueryData(browserAuthKey, value);
  }
  const logout = useMutation({ mutationFn: signOut, onSuccess: applyAccess });

  function changeIdentity(next: DemoIdentity) {
    if (next === identity) return;
    queryClient.removeQueries({ queryKey: modelKey(identity) });
    sessionStorage.setItem(identityStorageKey, next);
    setIdentity(next);
  }

  const isDemo = auth.data?.mode === 'demo';
  const active = isDemo ? identity : auth.data?.identity;
  if (!active) {
    const mode = auth.data?.mode ?? (auth.isError ? 'unavailable' : 'loading');
    return <SignIn mode={mode} onSignIn={applyAccess} />;
  }

  return (
    <Workbench
      key={active}
      identity={active}
      onIdentity={isDemo ? changeIdentity : undefined}
      onSignOut={isDemo ? undefined : () => logout.mutate()}
      signingOut={logout.isPending}
      theme={theme}
      onTheme={() =>
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
      }
      path={path}
      navigate={navigate}
    />
  );
}

function Workbench({
  identity,
  onIdentity,
  onSignOut,
  signingOut,
  theme,
  onTheme,
  path,
  navigate,
}: {
  identity: DemoIdentity;
  onIdentity?: (identity: DemoIdentity) => void;
  onSignOut?: () => void;
  signingOut: boolean;
  theme: 'dark' | 'light';
  onTheme: () => void;
  path: string;
  navigate: Navigate;
}) {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [notice, setNotice] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const q = useDeferredValue(search.trim());
  const [pathname, queryString] = path.split('?', 2);
  const id = objectPathId(pathname);
  const scenarioId = uuidSchema.safeParse(
    /^\/scenarios\/([0-9a-f-]+)$/i.exec(pathname)?.[1],
  ).data;
  const planning = pathname === '/scenarios' || Boolean(scenarioId);
  const params = new URLSearchParams(queryString);
  const revision = uuidSchema.safeParse(params.get('revision')).data;
  const mode = params.get('mode') === 'graph' ? 'graph' : 'document';

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => health(signal),
    retry: false,
  });
  const current = useQuery({
    queryKey: [...modelKey(identity), 'session'],
    queryFn: ({ signal }) => session(identity, signal),
    retry: false,
  });
  const vocabulary = useQuery({
    queryKey: [...modelKey(identity), 'metamodel'],
    queryFn: ({ signal }) => metamodel(identity, signal),
    enabled: Boolean(current.data),
    retry: false,
  });
  const canCreate = Boolean(
    vocabulary.data &&
    current.data?.scopes.some(
      (scope) => scope.writable && (!scopeId || scope.id === scopeId),
    ),
  );
  const service = healthQuery.isPending
    ? 'Checking service…'
    : healthQuery.isError
      ? 'Service unavailable'
      : `Service ${healthQuery.data.status} · Database ${healthQuery.data.database}`;

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (
        !editor &&
        event.key.toLowerCase() === 'k' &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [editor]);

  function changePath(next: string) {
    setNotice('');
    navigate(next);
  }

  function chooseCatalog(next: string) {
    setType(next);
    setMenuVisible(false);
    changePath('/');
  }

  function chooseScope(next: string) {
    setScopeId(next);
    setMenuVisible(false);
    changePath('/');
  }

  function clearFilters() {
    setSearch('');
    setType('');
    setScopeId('');
    changePath('/');
  }

  function afterEdit(id: string) {
    setEditor(null);
    void queryClient.invalidateQueries({ queryKey: modelKey(identity) });
    navigate(objectUrl(id));
    setNotice(editor?.kind === 'retire' ? 'Object retired.' : 'Changes saved.');
  }

  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>
      <header className="topbar">
        <LocalLink
          to="/"
          navigate={clearFilters}
          className="brand"
          title="ArchiMesh home"
        >
          <span className="brand-mark">
            <Icon name="mesh" size={25} />
          </span>
          <h1>ArchiMesh</h1>
        </LocalLink>
        <div role="search" className="global-search">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="repository-search">
            Search repository
          </label>
          <input
            ref={searchRef}
            type="search"
            id="repository-search"
            placeholder="Search the repository…"
            value={search}
            maxLength={100}
            onChange={(event) => {
              setSearch(event.target.value);
              changePath('/');
            }}
          />
          <kbd>{/Mac/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
        </div>
        <div className="top-actions">
          <div
            className={`service-status ${healthQuery.isError ? 'service-error' : ''}`}
            role="status"
            title={service}
          >
            <span aria-hidden="true" />
            {service}
          </div>
          {onIdentity ? (
            <label className="identity-control">
              <span className="sr-only">Local demo identity</span>
              <select
                value={identity}
                onChange={(event) => {
                  const parsed = identitySchema.safeParse(event.target.value);
                  if (parsed.success) onIdentity(parsed.data);
                }}
              >
                {Object.entries(identities).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="network-account">
              <span>{identities[identity]}</span>
              <button
                type="button"
                className="button"
                onClick={onSignOut}
                disabled={signingOut}
              >
                Sign out
              </button>
            </div>
          )}
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={onTheme}
            aria-label={
              theme === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            }
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>
      <div className="workbench">
        <nav className="sidebar" aria-label="Repository navigation">
          <button
            className="mobile-nav button"
            type="button"
            aria-expanded={menuVisible}
            onClick={() => setMenuVisible((visible) => !visible)}
          >
            <Icon name="catalog" /> Repository menu
          </button>
          <Sidebar
            current={current.data}
            metamodel={vocabulary.data}
            type={type}
            scopeId={scopeId}
            visible={menuVisible}
            planning={planning}
            onPlanning={() => {
              setMenuVisible(false);
              changePath('/scenarios');
            }}
            onCatalog={chooseCatalog}
            onScope={chooseScope}
          />
        </nav>
        <main id="workspace" tabIndex={-1}>
          {notice && (
            <div className="notice" aria-live="polite">
              <span>{notice}</span>
              <button
                className="icon-button"
                type="button"
                aria-label="Dismiss notice"
                onClick={() => setNotice('')}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          )}
          {current.isError ? (
            <EmptyState title="Could not open the repository" error>
              <p>
                {displayError(
                  current.error,
                  'Check that the local API is running and try again.',
                )}
              </p>
              <button
                className="button"
                type="button"
                onClick={() => void current.refetch()}
              >
                Try again
              </button>
            </EmptyState>
          ) : id ? (
            <ObjectWorkspace
              id={id}
              revision={revision}
              mode={mode}
              identity={identity}
              session={current.data}
              metamodel={vocabulary.data}
              navigate={changePath}
              onEdit={setEditor}
              theme={theme}
              onChanged={() => {
                setNotice('Layout saved.');
                void queryClient.invalidateQueries({
                  queryKey: modelKey(identity),
                });
              }}
            />
          ) : planning ? (
            <ScenarioWorkspace
              id={scenarioId}
              identity={identity}
              session={current.data}
              navigate={changePath}
            />
          ) : pathname !== '/' ? (
            <EmptyState title="Page unavailable">
              <LocalLink to="/" navigate={changePath} className="button">
                <Icon name="back" /> Back to catalog
              </LocalLink>
            </EmptyState>
          ) : (
            <div className="document-layout">
              <Catalog
                identity={identity}
                filters={{ q, type, scopeId }}
                metamodel={vocabulary.data}
                session={current.data}
                canCreate={canCreate}
                navigate={changePath}
                onCreate={() =>
                  setEditor({
                    kind: 'create',
                    type: type || undefined,
                    scopeId,
                  })
                }
                onClear={clearFilters}
              />
              <RepositoryInfo
                current={current.data}
                metamodel={vocabulary.data}
                scopeId={scopeId}
                onViews={() => chooseCatalog('view')}
              />
            </div>
          )}
        </main>
      </div>
      {editor && current.data && vocabulary.data && (
        <Editor
          identity={identity}
          target={editor}
          session={current.data}
          metamodel={vocabulary.data}
          onClose={() => setEditor(null)}
          onSaved={afterEdit}
        />
      )}
    </div>
  );
}

function Sidebar({
  current,
  metamodel,
  type,
  scopeId,
  visible,
  planning,
  onPlanning,
  onCatalog,
  onScope,
}: {
  current?: ModelSession;
  metamodel?: Metamodel;
  type: string;
  scopeId: string;
  visible: boolean;
  planning: boolean;
  onPlanning: () => void;
  onCatalog: (type: string) => void;
  onScope: (id: string) => void;
}) {
  const catalogs =
    metamodel?.entityTypes.filter((item) => item.id !== 'view') ?? [];
  const views = metamodel?.entityTypes.some((item) => item.id === 'view');
  return (
    <div className={`nav-groups ${visible ? 'nav-expanded' : ''}`}>
      <div className="nav-group">
        <h2>Catalogs</h2>
        <button
          className="nav-item"
          type="button"
          aria-pressed={!planning && !type}
          onClick={() => onCatalog('')}
        >
          <span className="nav-icon">
            <Icon name="catalog" />
          </span>
          All objects
        </button>
        {catalogs.map((item) => (
          <button
            className="nav-item"
            key={item.id}
            type="button"
            aria-pressed={!planning && type === item.id}
            onClick={() => onCatalog(item.id)}
          >
            <TypeIcon type={item.id} />
            {item.label}
          </button>
        ))}
        {views && (
          <button
            className="nav-item"
            type="button"
            aria-pressed={!planning && type === 'view'}
            onClick={() => onCatalog('view')}
          >
            <TypeIcon type="view" />
            Saved views
          </button>
        )}
      </div>
      <div className="nav-group">
        <h2>Planning</h2>
        <button
          type="button"
          className="nav-item"
          aria-pressed={planning}
          onClick={onPlanning}
        >
          <TypeIcon type="project" />
          Scenarios
        </button>
      </div>
      <div className="nav-group">
        <h2>Workspaces</h2>
        <button
          className="nav-item"
          type="button"
          aria-pressed={!scopeId}
          onClick={() => onScope('')}
        >
          <span className="nav-icon">
            <Icon name="project" />
          </span>
          All workspaces
        </button>
        {current?.scopes.map((item) => (
          <button
            type="button"
            className="nav-item workspace-item"
            key={item.id}
            aria-pressed={scopeId === item.id}
            onClick={() => onScope(item.id)}
          >
            <span className="workspace-dot" aria-hidden="true" />
            <span>{item.label}</span>
            {!item.writable && <span className="read-only-label">Read</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function RepositoryInfo({
  current,
  metamodel,
  scopeId,
  onViews,
}: {
  current?: ModelSession;
  metamodel?: Metamodel;
  scopeId: string;
  onViews: () => void;
}) {
  const selected = current?.scopes.find((item) => item.id === scopeId);
  return (
    <aside
      className="inspector repository-info"
      aria-label="Repository information"
    >
      <div className="inspector-heading">
        <Icon name="mesh" /> <h3>Repository</h3>
      </div>
      <div className="inspector-body">
        <h4>Active scope</h4>
        <p className="context-scope">
          {selected?.label ?? 'All accessible workspaces'}
        </p>
        {current && (
          <p className="muted">
            {selected
              ? selected.writable
                ? 'Read and edit access'
                : 'Read-only access'
              : `${current.scopes.length} ${current.scopes.length === 1 ? 'workspace' : 'workspaces'} available`}
          </p>
        )}
      </div>
      {metamodel && (
        <div className="inspector-body">
          <h4>Metamodel</h4>
          <dl className="property-list">
            <div>
              <dt>Entity types</dt>
              <dd>{metamodel.entityTypes.length}</dd>
            </div>
            <div>
              <dt>Relationship types</dt>
              <dd>{metamodel.relationshipTypes.length}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{metamodel.version}</dd>
            </div>
          </dl>
        </div>
      )}
      <div className="inspector-body">
        <h4>Diagrams and matrices</h4>
        <p className="muted">
          Open a saved view to explore objects and relationships in context.
        </p>
        <button type="button" className="text-button" onClick={onViews}>
          Browse saved views <Icon name="arrow" size={15} />
        </button>
      </div>
    </aside>
  );
}
