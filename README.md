# Archimesh

A foundation for an agent-native enterprise architecture knowledge platform.
This repository currently contains only a runnable application skeleton.

## Prerequisites

- Node.js 22.13 or newer in the Node 22 LTS line, with Corepack.
- Docker and Docker Compose.
- pnpm is pinned by `packageManager`; enable its shim with `corepack enable`.

## Run locally

From the repository root:

```sh
cp .env.example .env
docker compose up -d --wait
set -a; . ./.env; set +a
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Open <http://localhost:5173>. Vite proxies `/api` to Fastify on port 3000.
Both applications reload when their source changes. The shared contracts package
is built when `pnpm dev` starts; restart it after changing a contract.
The API health check is at <http://localhost:3000/api/health>, and the OpenAPI
document is at <http://localhost:3000/api/openapi.json>. Health returns HTTP
503 if PostgreSQL cannot be reached.

`.env.example` and Compose contain **local development-only** database
credentials. Never use them in a deployed environment. The shell command above
exports `.env` for the current shell; the application does not load it
automatically. Azurite exposes the Blob endpoint on localhost port 10000; the
application does not yet use it. `docker compose down` stops the services
without deleting data; `docker compose down -v` also deletes their volumes.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

The browser tests require the local database and exported environment above.
`pnpm format` formats supported files. CI runs these checks and builds the image.

## Migrations and container

Kysely runs migrations in `apps/server/migrations` in filename order, recording
their history in PostgreSQL. There are no application tables yet. Add
uniquely named `.js` ES modules exporting an async `up(db)` function and,
where appropriate, `down(db)`. Use JavaScript so the same migration runs via
the development command and the compiled production image. Run
`pnpm db:migrate` from the repository root with `DATABASE_URL` exported.
Never edit a migration already applied to a shared database.

Build the image with `docker build -t archimesh .`. It serves the compiled
frontend and API on port 3000. Supply `DATABASE_URL` and any required
PostgreSQL connection environment securely at runtime. Run migrations as a
separate controlled deployment step using `node dist/migrate.js` in the
container's default working directory; migrations are not run on startup.
The image is not an authenticated or production-ready deployment.

## Scope and design

See [architecture](docs/architecture/overview.md),
[ADR 0001](docs/adr/0001-foundation.md), and the
[Azure deployment direction](infra/azure/README.md). PostgreSQL is intended to
be authoritative for canonical Markdown and indexed metadata; Git is intended
for interchange, not primary storage. OKF, the metamodel, agent interfaces,
authentication, authorization, diagrams, and cloud infrastructure are not yet
implemented. No Azure resources are provisioned by this repository.
