# ArchiMesh

ArchiMesh is an enterprise architecture knowledge platform in development. Its goal is to give architects, analysts, and development agents a shared model of business capabilities, applications, data, and the relationships between them. The planned repository stores canonical Markdown and its searchable projections in PostgreSQL. Git supports interchange and collaboration.

**Current status.** This branch provides the engineering foundation and a runnable skeleton. You can start the web UI, check its database connection, and inspect the API schema. Enterprise modeling, knowledge editing, and access controls are planned in the [v0.1 specification](docs/plans/README.md). Use synthetic data and keep the application local.

## Run locally on Windows

Use Node.js 22 LTS, Corepack, and PostgreSQL 16. The repository pins pnpm. Follow the [native PostgreSQL setup](docs/development/native-postgresql.md) to locate PostgreSQL or extract verified portable binaries. Then run these commands in PowerShell from the repository root.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm db:local setup
corepack pnpm db:migrate
corepack pnpm dev
```

Open <http://127.0.0.1:5173>. The page should show a connected database. Vite proxies the API to Fastify on port 3000. The [health endpoint](http://127.0.0.1:3000/api/health) returns HTTP 503 if PostgreSQL is unavailable. The [OpenAPI document](http://127.0.0.1:3000/api/openapi.json) lists the API contract.

Press Ctrl+C to stop the app. Run `corepack pnpm db:local stop` to stop PostgreSQL and keep the data. For later sessions, run `corepack pnpm db:local start` followed by `corepack pnpm dev`. Run `corepack pnpm db:migrate` when the checked-out branch adds migrations. Restart the dev command after editing shared API contracts so it rebuilds them.

The [native setup guide](docs/development/native-postgresql.md) covers macOS, existing local installations, and troubleshooting.

## Verify changes

Install Playwright's Chromium once per Playwright version. Browser tests start their own API and web server on ports 3001 and 5174.

```powershell
corepack pnpm exec playwright install chromium
corepack pnpm verify
corepack pnpm test:db
corepack pnpm test:e2e
```

`verify` runs formatting, lint, type checks, unit tests, and the build. The database and browser tests require a running local PostgreSQL instance. Browser tests use a separate database and migrate it before exercising the UI. See [Contributing](CONTRIBUTING.md) for the individual checks.

## Optional Docker workflow

For a fresh checkout using Compose, copy `.env.example` to `.env`. Keep a native setup's existing `.env` and use a separate checkout if you want to switch between the two workflows.

```powershell
Copy-Item .env.example .env
docker compose up -d --wait postgres
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm dev
```

Press Ctrl+C and run `docker compose stop postgres` to stop services and keep the database volume. Start Azurite separately with `docker compose up -d azurite` if working on a feature that needs Blob Storage.

Build the application image with `docker build -t archimesh .`. It serves the compiled web UI and API on port 3000. Supply the database configuration through the deployment environment. Run `node dist/migrate.js` in the container's default working directory as a separate migration step before starting the service.

## Repository layout

| Path                 | Responsibility                                           |
| -------------------- | -------------------------------------------------------- |
| `apps/web`           | React and Vite web application                           |
| `apps/server`        | Fastify API, PostgreSQL access, and Kysely migrations    |
| `packages/contracts` | Shared Zod contracts                                     |
| `packages/core`      | Framework-independent domain logic as features are added |
| `infra/azure`        | Future Azure deployment design                           |

See the [architecture overview](docs/architecture/overview.md), [ADR 0001](docs/adr/0001-foundation.md), [engineering workflow](docs/development/workflow.md), and [Azure deployment direction](infra/azure/README.md). ArchiMesh is licensed under [GPLv3](LICENSE).
