# ArchiMesh

ArchiMesh is an enterprise architecture knowledge repository for linking
business capabilities to the applications, data, projects and relationships
that support them. The v0.1 local demo lets architects and development agents
search the same model, reuse existing solutions, and see how architecture
changes over time.

The repository keeps canonical OKF Markdown and its searchable projections
in PostgreSQL. The workbench includes an object catalog, Markdown authoring,
revision history, semantic graph exploration, saved diagrams and data
responsibility matrices. Alderfen Works is the fictional reference model.

## Run locally on Windows

Use Node.js 22 LTS, Corepack and PostgreSQL 16. Follow the
[native PostgreSQL setup](docs/development/native-postgresql.md) to locate
existing binaries or extract the verified Windows ZIP.

From the repository root in PowerShell:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm db:local setup
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

Open <http://127.0.0.1:5173>. Start with **Supplier Onboarding** or use
**Saved views** to open **Procurement Solution Context**. The identity selector
exposes three synthetic demo roles. See the [guided walkthrough](docs/development/demo-model.md)
for the architecture and the [agent tools](docs/development/agent-tools.md)
for local CLI and MCP use.

Press Ctrl+C to stop the app, then use `corepack pnpm db:local stop` to stop
the cluster. For later sessions use `corepack pnpm db:local start`, then
`corepack pnpm dev`. Run `db:migrate` after pulling schema changes. Re-running
`db:seed` preserves work already recorded on the local model.

The [native setup guide](docs/development/native-postgresql.md) also covers
macOS, an existing dedicated PostgreSQL installation, and troubleshooting.
The documented macOS path shares the same Node scripts.

## Verify changes

```powershell
corepack pnpm exec playwright install chromium
corepack pnpm verify
corepack pnpm test:db
corepack pnpm test:e2e
```

The first command installs Playwright's pinned Chromium. The source suite
checks formatting, lint, strict typing, builds and unit tests. Database and
browser suites migrate and seed their own PostgreSQL database, with different
credentials from the development instance. Playwright uses ports 3001 and 5174.
See [Contributing](CONTRIBUTING.md) for the engineering workflow.

## Optional Docker

For a fresh Compose setup, copy `.env.example` to `.env` and run
`docker compose up -d --wait postgres`, then run install, migrate, seed and dev
above. The sample credentials are for the fresh loopback Compose database.
Use a separate configuration if you already use the native cluster.
Azurite remains optional. The application container builds with
`docker build -t archimesh .`. See the
[deployment direction](infra/azure/README.md).

## Project status

This release is a **local synthetic-data demo**. Production identity
integration and enterprise governance are future work. The deployed mode
denies the demo identity mechanism. The API description is at
`/api/openapi.json`.

The [v0.1 handoff](docs/development/v0.1-handoff.md) lists verified behavior and
remaining work. See the [architecture decisions](docs/adr/0002-canonical-knowledge-and-scope.md)
and [work orders](docs/plans/README.md) for the implementation context.

ArchiMesh is licensed under [GPLv3](LICENSE).
