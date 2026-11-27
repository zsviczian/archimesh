# Engineering foundation execution record

Milestone: PR #2 on `codex/engineering-foundation`.
Baseline: work order commit `d064c9a`. Acceptance follows
[work order 01](../plans/01-engineering-foundation.md).

## Work and ownership

- Lead: local PostgreSQL scripts, environment loading, agent setup, integration
  and verification.
- Documentation specialist: product introduction, contribution guide, security
  and native setup.
- Quality specialist: CI, platform gates and dependency boundaries.
- Architecture specialist: independently map the product plan and upstream
  OKF profile for the next phase.

## Decisions and assumptions

- Use the pinned pnpm via Corepack. Retain PostgreSQL 16 in environments that
  build and exercise the repository.
- Prefer a project-owned loopback PostgreSQL cluster on port 55432. Keep
  separate runtime and migration credentials in local ignored files. Existing
  installations can provide PostgreSQL binaries without giving the project
  access to their data directories.
- The Mac lane uses the same Node scripts and PostgreSQL 16 binaries. This
  Windows session cannot verify a Mac host.
- The active session started in another repository. Specialists used explicit
  bounded roles. New repository-local Codex definitions are validated locally.

## Evidence and next action

- Windows, Node v22.22.3, Codex CLI 0.171.0-alpha.13.2 and Corepack 0.34.6.
  Pinned pnpm 10.34.9 successfully performed a frozen install. Git ignores
  generated tool caches, the portable cluster, browser binaries and credentials.
- Verified the EDB PostgreSQL 16.16 archive against its published SHA-256.
  Verified setup, migration, stop/start and expected privileges for the four
  native development and test connections.
- `corepack pnpm verify` passed formatting, lint, strict type checks, build
  and two Fastify tests. The Windows sandbox required a reviewed build
  execution because esbuild could not enumerate parent directories.
- `corepack pnpm test:e2e` passed both Chromium health journeys after replacing
  the hanging Windows `tsx watch` startup with Node's watch mode and waiting
  for API readiness before launching browsers.
- Parsed six standalone TOML agents and validated seven YAML skill headers.
  Verified lint rejects representative prohibited imports.
- macOS and optional Docker were outside this local verification.
  The CI workflow covers Windows and Linux; see the PR for hosted results.

Next: merge this branch into the stacked product branch and start the v0.1
repository workbench and persistence checkpoint.
