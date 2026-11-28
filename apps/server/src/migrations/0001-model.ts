import { sql, type Kysely } from 'kysely';

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb) {
  const database = await sql<{
    name: string;
  }>`SELECT current_database() AS name`.execute(db);
  const runtimeRole =
    database.rows[0]?.name === 'archimesh_test'
      ? 'archimesh_test_app'
      : 'archimesh_app';
  const role = sql.id(runtimeRole);

  await sql`
    CREATE TABLE model_scopes (
      id text PRIMARY KEY,
      label text NOT NULL
    );
    CREATE TABLE model_scope_grants (
      actor text NOT NULL,
      scope_id text NOT NULL REFERENCES model_scopes,
      can_write boolean NOT NULL,
      PRIMARY KEY (actor, scope_id)
    );
    INSERT INTO model_scopes VALUES
      ('shared', 'Shared catalogs'),
      ('procurement', 'Procurement modernization'),
      ('integration', 'Freight integration');
    INSERT INTO model_scope_grants VALUES
      ('architect', 'shared', true),
      ('architect', 'procurement', true),
      ('architect', 'integration', true),
      ('contractor-procurement', 'shared', false),
      ('contractor-procurement', 'procurement', true),
      ('contractor-integration', 'shared', false),
      ('contractor-integration', 'integration', true);

    CREATE FUNCTION model_actor() RETURNS text STABLE LANGUAGE sql
      SET search_path = pg_catalog
      AS $$ SELECT nullif(current_setting('archimesh.actor', true), '') $$;
    CREATE FUNCTION model_scope_allowed(scope text, write_required boolean)
      RETURNS boolean STABLE LANGUAGE sql SET search_path = pg_catalog, public
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.model_scope_grants
          WHERE actor = public.model_actor() AND scope_id = scope
            AND (NOT write_required OR can_write)
        )
      $$;

    CREATE TABLE model_commits (
      id uuid PRIMARY KEY,
      sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      actor text NOT NULL,
      request_id uuid NOT NULL,
      request_hash text NOT NULL,
      recorded_at timestamptz NOT NULL,
      result jsonb NOT NULL,
      UNIQUE (actor, request_id)
    );

    CREATE TABLE model_objects (
      id uuid PRIMARY KEY,
      scope_id text NOT NULL REFERENCES model_scopes,
      type text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      search_text text NOT NULL,
      search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple'::regconfig, search_text)
      ) STORED,
      data jsonb NOT NULL,
      source_id uuid REFERENCES model_objects DEFERRABLE INITIALLY DEFERRED,
      target_id uuid REFERENCES model_objects DEFERRABLE INITIALLY DEFERRED,
      revision_id uuid NOT NULL,
      updated_at timestamptz NOT NULL,
      retired boolean NOT NULL DEFAULT false,
      UNIQUE (id, scope_id),
      CHECK (
        (type = 'relationship' AND source_id IS NOT NULL AND target_id IS NOT NULL AND source_id <> target_id)
        OR (type <> 'relationship' AND source_id IS NULL AND target_id IS NULL)
      )
    );
    CREATE INDEX model_objects_scope_type_idx ON model_objects (scope_id, type, lower(title), id) WHERE NOT retired;
    CREATE INDEX model_objects_title_idx ON model_objects (lower(title), id) WHERE NOT retired;
    CREATE INDEX model_objects_source_idx ON model_objects (source_id) WHERE NOT retired;
    CREATE INDEX model_objects_target_idx ON model_objects (target_id) WHERE NOT retired;
    CREATE INDEX model_objects_search_idx ON model_objects USING gin (search_vector) WHERE NOT retired;

    CREATE TABLE model_revisions (
      id uuid PRIMARY KEY,
      object_id uuid NOT NULL,
      scope_id text NOT NULL,
      commit_id uuid NOT NULL REFERENCES model_commits,
      commit_sequence bigint NOT NULL REFERENCES model_commits (sequence),
      recorded_at timestamptz NOT NULL,
      actor text NOT NULL,
      markdown text NOT NULL,
      data jsonb NOT NULL,
      effective_from date NOT NULL,
      effective_to date,
      retired boolean NOT NULL,
      UNIQUE (object_id, id),
      FOREIGN KEY (object_id, scope_id) REFERENCES model_objects (id, scope_id)
        DEFERRABLE INITIALLY DEFERRED,
      CHECK (effective_to IS NULL OR effective_to > effective_from)
    );
    CREATE INDEX model_revisions_history_idx ON model_revisions (object_id, commit_sequence DESC);
    ALTER TABLE model_objects
      ADD CONSTRAINT model_current_revision FOREIGN KEY (id, revision_id)
      REFERENCES model_revisions (object_id, id) DEFERRABLE INITIALLY DEFERRED;

    CREATE TABLE model_scenarios (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      scope_id text NOT NULL REFERENCES model_scopes,
      base_sequence bigint NOT NULL,
      created_at timestamptz NOT NULL,
      operations jsonb NOT NULL
    );

    ALTER TABLE model_scopes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_scopes FORCE ROW LEVEL SECURITY;
    CREATE POLICY model_scopes_read ON model_scopes
      FOR SELECT USING (model_scope_allowed(id, false));
    ALTER TABLE model_scope_grants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_scope_grants FORCE ROW LEVEL SECURITY;
    CREATE POLICY model_grants_self ON model_scope_grants
      FOR SELECT USING (actor = model_actor());

    ALTER TABLE model_objects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_objects FORCE ROW LEVEL SECURITY;
    CREATE POLICY model_objects_read ON model_objects
      FOR SELECT USING (model_scope_allowed(scope_id, false));
    CREATE POLICY model_objects_create ON model_objects
      FOR INSERT WITH CHECK (model_scope_allowed(scope_id, true));
    CREATE POLICY model_objects_write ON model_objects
      FOR UPDATE USING (model_scope_allowed(scope_id, true))
      WITH CHECK (model_scope_allowed(scope_id, true));

    ALTER TABLE model_revisions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_revisions FORCE ROW LEVEL SECURITY;
    CREATE POLICY model_revisions_read ON model_revisions
      FOR SELECT USING (model_scope_allowed(scope_id, false));
    CREATE POLICY model_revisions_create ON model_revisions
      FOR INSERT WITH CHECK (actor = model_actor() AND model_scope_allowed(scope_id, true));

    ALTER TABLE model_commits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_commits FORCE ROW LEVEL SECURITY;
    CREATE POLICY model_commits_read ON model_commits
      FOR SELECT USING (actor = model_actor());
    CREATE POLICY model_commits_create ON model_commits
      FOR INSERT WITH CHECK (actor = model_actor());

    ALTER TABLE model_scenarios ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_scenarios FORCE ROW LEVEL SECURITY;
    CREATE POLICY model_scenarios_read ON model_scenarios
      FOR SELECT USING (model_scope_allowed(scope_id, false));
    CREATE POLICY model_scenarios_create ON model_scenarios
      FOR INSERT WITH CHECK (model_scope_allowed(scope_id, true));
  `.execute(db);

  await sql`
    REVOKE ALL ON model_scopes, model_scope_grants, model_objects, model_revisions,
      model_commits, model_scenarios, kysely_migration, kysely_migration_lock FROM ${role};
    REVOKE ALL ON FUNCTION model_actor(), model_scope_allowed(text, boolean) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION model_actor(), model_scope_allowed(text, boolean) TO ${role};
    GRANT SELECT ON model_scopes, model_scope_grants TO ${role};
    GRANT SELECT, INSERT ON model_objects, model_revisions, model_commits, model_scenarios TO ${role};
    GRANT UPDATE (title, description, search_text, data, source_id, target_id, revision_id, updated_at, retired)
      ON model_objects TO ${role};
    GRANT USAGE ON SEQUENCE model_commits_sequence_seq TO ${role};
  `.execute(db);
}

export async function down(db: MigrationDb) {
  await sql`
    DROP TABLE model_scenarios;
    ALTER TABLE model_objects DROP CONSTRAINT model_current_revision;
    DROP TABLE model_revisions, model_objects, model_commits, model_scope_grants, model_scopes;
    DROP FUNCTION model_scope_allowed(text, boolean), model_actor();
  `.execute(db);
}
