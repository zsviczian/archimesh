import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  Changeset,
  DemoIdentity,
  Metamodel,
  ModelObject,
  ModelRelationship,
  ModelSession,
  ModelSummary,
} from '@archimesh/contracts';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  applyChangeset,
  listObjects,
  modelKey,
  validateChangeset,
} from './api';
import { displayError, Icon, label, TypeIcon } from './ui';

export type EditorTarget =
  | { kind: 'create'; type?: string; scopeId?: string; source?: ModelSummary }
  | { kind: 'update' | 'retire'; object: ModelObject };

type Fields = {
  title: string;
  type: string;
  scopeId: string;
  description: string;
  owner: string;
  body: string;
  relationshipType: string;
  viewpoint: string;
};

function initialFields(
  target: EditorTarget,
  scopes: ModelSession['scopes'],
  types: Metamodel['entityTypes'],
): Fields {
  return {
    title: '',
    type:
      target.kind === 'create'
        ? (target.type ?? types[0]?.id ?? 'application')
        : target.object.type,
    scopeId:
      target.kind === 'create'
        ? (scopes.find((scope) => scope.id === target.scopeId)?.id ??
          scopes[0]?.id ??
          '')
        : target.object.scopeId,
    description: '',
    owner: '',
    body: '',
    relationshipType: '',
    viewpoint: 'solution-context',
  };
}

function objectMarkdown(
  id: string,
  fields: Fields,
  relationship: ModelRelationship | null,
) {
  const quote = JSON.stringify;
  const extension = [
    'x-archimesh-model:',
    `  id: ${quote(id)}`,
    '  lifecycle: draft',
    fields.owner.trim() && `  owner: ${quote(fields.owner.trim())}`,
  ];
  if (relationship) {
    extension.push(
      '  relationship:',
      `    type: ${quote(relationship.type)}`,
      `    sourceId: ${quote(relationship.sourceId)}`,
      `    targetId: ${quote(relationship.targetId)}`,
    );
  }
  if (fields.type === 'view') {
    extension.push(
      '  view:',
      `    viewpoint: ${quote(fields.viewpoint)}`,
      '    objectIds: []',
      '    relationshipIds: []',
      '    positions: {}',
    );
  }
  return [
    '---',
    `type: ${quote(fields.type)}`,
    `title: ${quote(fields.title.trim())}`,
    `description: ${quote(fields.description.trim())}`,
    'aliases: []',
    ...extension.filter(Boolean),
    '---',
    '',
    fields.body,
    '',
  ].join('\n');
}

function EndpointPicker({
  kind,
  identity,
  selected,
  allowedTypes,
  onSelect,
}: {
  kind: 'Source' | 'Target';
  identity: DemoIdentity;
  selected: ModelSummary | null;
  allowedTypes?: string[];
  onSelect: (value: ModelSummary | null) => void;
}) {
  const [term, setTerm] = useState('');
  const q = useDeferredValue(term.trim());
  const query = useQuery({
    queryKey: [...modelKey(identity), 'endpoint', q],
    queryFn: ({ signal }) =>
      listObjects(identity, { q, type: '', scopeId: '' }, undefined, signal),
    enabled: q.length > 0 && !selected,
  });
  const results = query.data?.items.filter(
    (item) =>
      !item.retired && (!allowedTypes || allowedTypes.includes(item.type)),
  );
  return (
    <div className="field endpoint-picker">
      <div className="field-name">{kind} object</div>
      {selected ? (
        <div className="selected-endpoint">
          <TypeIcon type={selected.type} />
          <span>{selected.title}</span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Clear ${kind.toLowerCase()} object`}
            onClick={() => onSelect(null)}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            aria-label={`Search ${kind.toLowerCase()} object`}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            maxLength={100}
            placeholder="Search the repository"
          />
          {q && (
            <ul className="endpoint-results" aria-label={`${kind} results`}>
              {query.isPending ? (
                <li className="muted">Searching…</li>
              ) : query.isError ? (
                <li className="muted">Search unavailable.</li>
              ) : results?.length ? (
                results.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onSelect(item)}>
                      <TypeIcon type={item.type} />
                      {item.title}
                    </button>
                  </li>
                ))
              ) : (
                <li className="muted">
                  No matching objects on this page. Refine the search.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function Editor({
  identity,
  target,
  session,
  metamodel,
  onClose,
  onSaved,
}: {
  identity: DemoIdentity;
  target: EditorTarget;
  session: ModelSession;
  metamodel: Metamodel;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lastRequest = useRef<{
    signature: string;
    changeset: Changeset;
  } | null>(null);
  const writableScopes = session.scopes.filter((item) => item.writable);
  const [id] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState(() =>
    initialFields(target, writableScopes, metamodel.entityTypes),
  );
  const [source, setSource] = useState<ModelSummary | null>(
    target.kind === 'create' ? (target.source ?? null) : null,
  );
  const [endpoint, setEndpoint] = useState<ModelSummary | null>(null);
  const [markdown, setMarkdown] = useState(
    target.kind === 'update' ? target.object.markdown : '',
  );
  const [raw, setRaw] = useState(target.kind === 'update');
  const [feedback, setFeedback] = useState<{
    style: 'error' | 'success';
    messages: string[];
  } | null>(null);
  const relationshipMode = fields.type === 'relationship';
  const relationType = metamodel.relationshipTypes.find(
    (type) => type.id === fields.relationshipType,
  );
  const relationship =
    relationshipMode && relationType && source && endpoint
      ? { type: relationType.id, sourceId: source.id, targetId: endpoint.id }
      : null;
  const validEndpoints =
    relationship &&
    relationType &&
    source &&
    endpoint &&
    relationType.sourceTypes.includes(source.type) &&
    relationType.targetTypes.includes(endpoint.type);
  const formMarkdown = objectMarkdown(id, fields, relationship);
  const validContent =
    target.kind === 'retire' ||
    (raw
      ? markdown.trim().length > 0
      : fields.title.trim().length > 0 &&
        (!relationshipMode || Boolean(validEndpoints)));
  const canSubmit = validContent && Boolean(fields.scopeId);
  const dirty =
    target.kind === 'update'
      ? target.object.markdown !== markdown
      : target.kind === 'create' &&
        Boolean(
          fields.title ||
          fields.description ||
          fields.owner ||
          fields.body ||
          markdown ||
          endpoint,
        );

  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function protect(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  function update<Key extends keyof Fields>(field: Key, value: Fields[Key]) {
    setFields((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  function prepareChangeset(): Changeset {
    const content = raw ? markdown : formMarkdown;
    const operation =
      target.kind === 'create'
        ? {
            kind: 'create' as const,
            scopeId: fields.scopeId,
            markdown: content,
          }
        : target.kind === 'retire'
          ? {
              kind: 'retire' as const,
              id: target.object.id,
              expectedRevisionId: target.object.revisionId,
            }
          : {
              kind: 'update' as const,
              id: target.object.id,
              expectedRevisionId: target.object.revisionId,
              markdown: content,
            };
    const signature = JSON.stringify(operation);
    if (lastRequest.current?.signature === signature)
      return lastRequest.current.changeset;
    const changeset = {
      requestId: crypto.randomUUID(),
      operations: [operation],
    };
    lastRequest.current = { signature, changeset };
    return changeset;
  }

  const validate = useMutation({
    mutationFn: (changeset: Changeset) =>
      validateChangeset(identity, changeset),
    onSuccess: (result) =>
      setFeedback({
        style: result.valid ? 'success' : 'error',
        messages: result.valid ? ['Validation passed.'] : result.issues,
      }),
    onError: (error) =>
      setFeedback({
        style: 'error',
        messages: [displayError(error, 'Validation is unavailable.')],
      }),
  });
  const save = useMutation({
    mutationFn: (changeset: Changeset) => applyChangeset(identity, changeset),
    onSuccess: (result) => {
      const saved = result.objects[0];
      if (saved) onSaved(saved.id);
      else
        setFeedback({
          style: 'error',
          messages: ['The server returned no saved object.'],
        });
    },
    onError: (error) =>
      setFeedback({
        style: 'error',
        messages: [displayError(error, 'The change could not be saved.')],
      }),
  });
  const busy = validate.isPending || save.isPending;
  const title =
    target.kind === 'create'
      ? relationshipMode
        ? 'New relationship'
        : 'New object'
      : target.kind === 'update'
        ? 'Edit Markdown'
        : 'Retire object';

  function closeEditor() {
    if (busy) return;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  }

  return (
    <dialog
      className="editor-dialog"
      ref={dialog}
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        closeEditor();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !busy) save.mutate(prepareChangeset());
        }}
      >
        <header className="dialog-header">
          <div>
            <h2 id="editor-title">{title}</h2>
            {target.kind !== 'create' && <p>{target.object.title}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={closeEditor}
            aria-label="Close editor"
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </header>
        <fieldset className="editor-fields" disabled={busy}>
          {target.kind === 'create' && (
            <div className="form-grid">
              <label className="field">
                Workspace
                <select
                  value={fields.scopeId}
                  onChange={(event) => update('scopeId', event.target.value)}
                >
                  {writableScopes.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.label}
                    </option>
                  ))}
                </select>
              </label>
              {!raw && (
                <label className="field">
                  Object type
                  <select
                    value={fields.type}
                    onChange={(event) => update('type', event.target.value)}
                  >
                    {metamodel.entityTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                    {!metamodel.entityTypes.some(
                      (type) => type.id === 'relationship',
                    ) && <option value="relationship">Relationship</option>}
                  </select>
                </label>
              )}
            </div>
          )}
          {target.kind === 'create' && !raw && (
            <>
              <label className="field">
                Title
                <input
                  required
                  maxLength={160}
                  value={fields.title}
                  onChange={(event) => update('title', event.target.value)}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Summary
                  <input
                    maxLength={400}
                    value={fields.description}
                    onChange={(event) =>
                      update('description', event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Owner
                  <input
                    maxLength={160}
                    value={fields.owner}
                    onChange={(event) => update('owner', event.target.value)}
                  />
                </label>
              </div>
              {fields.type === 'view' && (
                <label className="field">
                  Viewpoint
                  <select
                    value={fields.viewpoint}
                    onChange={(event) =>
                      update('viewpoint', event.target.value)
                    }
                  >
                    <option value="solution-context">Solution context</option>
                    <option value="business-object-map">
                      Business object map
                    </option>
                  </select>
                </label>
              )}
              {relationshipMode && (
                <>
                  <label className="field">
                    Relationship type
                    <select
                      required
                      value={fields.relationshipType}
                      onChange={(event) =>
                        update('relationshipType', event.target.value)
                      }
                    >
                      <option value="">Choose a relationship type</option>
                      {metamodel.relationshipTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {relationType && (
                    <p className="muted field-note">
                      {relationType.sourceTypes.map(label).join(', ')} to{' '}
                      {relationType.targetTypes.map(label).join(', ')}
                    </p>
                  )}
                  <div className="form-grid">
                    <EndpointPicker
                      kind="Source"
                      identity={identity}
                      selected={source}
                      allowedTypes={relationType?.sourceTypes}
                      onSelect={(value) => {
                        setSource(value);
                        setFeedback(null);
                      }}
                    />
                    <EndpointPicker
                      kind="Target"
                      identity={identity}
                      selected={endpoint}
                      allowedTypes={relationType?.targetTypes}
                      onSelect={(value) => {
                        setEndpoint(value);
                        setFeedback(null);
                      }}
                    />
                  </div>
                  {relationship && !validEndpoints && (
                    <p className="form-error">
                      Choose endpoints allowed by this relationship type.
                    </p>
                  )}
                </>
              )}
              <label className="field">
                Markdown body
                <textarea
                  rows={5}
                  value={fields.body}
                  maxLength={60000}
                  onChange={(event) => update('body', event.target.value)}
                  placeholder="Describe the purpose and context."
                />
              </label>
              <button
                type="button"
                className="button subtle align-start"
                onClick={() => {
                  setMarkdown(formMarkdown);
                  setRaw(true);
                  setFeedback(null);
                }}
              >
                <Icon name="document" /> Edit generated Markdown
              </button>
            </>
          )}
          {raw && (
            <label className="field">
              YAML and Markdown
              <textarea
                className="source-editor"
                rows={16}
                required
                maxLength={65536}
                value={markdown}
                spellCheck={false}
                onChange={(event) => {
                  setMarkdown(event.target.value);
                  setFeedback(null);
                }}
              />
            </label>
          )}
          {target.kind === 'retire' && (
            <p className="muted">
              Retiring this object removes it from the active catalog. Its
              revision history remains available to authorized users.
            </p>
          )}
          {feedback && (
            <div
              className={`form-feedback ${feedback.style}`}
              role={feedback.style === 'error' ? 'alert' : undefined}
              aria-live="polite"
            >
              <ul>
                {feedback.messages.map((message, index) => (
                  <li key={`${index}:${message}`}>{message}</li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>
        <footer className="dialog-actions">
          <button
            type="button"
            className="button subtle"
            onClick={closeEditor}
            disabled={busy}
          >
            Cancel
          </button>
          {target.kind !== 'retire' && (
            <button
              type="button"
              className="button"
              disabled={!canSubmit || busy}
              onClick={() => validate.mutate(prepareChangeset())}
            >
              {validate.isPending ? 'Validating…' : 'Validate'}
            </button>
          )}
          <button
            type="submit"
            className={`button ${target.kind === 'retire' ? 'danger' : 'primary'}`}
            disabled={!canSubmit || busy}
          >
            {save.isPending
              ? 'Saving…'
              : target.kind === 'retire'
                ? 'Retire object'
                : 'Save changes'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
