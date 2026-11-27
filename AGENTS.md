# ArchiMesh agent instructions

ArchiMesh is a GPLv3 enterprise architecture knowledge repository. Use synthetic
data and develop against PostgreSQL 16, Node.js 22 and the pinned pnpm version.
Start with the [workflow](docs/development/workflow.md), relevant
[work order](docs/plans/README.md) and [ADRs](docs/adr/0001-foundation.md).

- Keep dependency direction explicit. Core owns domain rules and canonical OKF.
  Contracts own wire validation. Server owns orchestration, authorization and
  SQL. Web consumes contracts and calls the server. Keep platform dependencies
  out of core and server implementation details out of web.
- Use strict TypeScript, validated boundaries, named domain concepts and the
  smallest cohesive module. Review new direct dependencies for license,
  maintenance, supply chain and platform support. Commit the matching lockfile.
- Apply server-side permissions before exposing IDs, counts, edges, Markdown,
  history, exports or errors. Treat input and imported files as untrusted. Use
  parameter binding and transaction-scoped identity. Keep secrets out of
  tracked files, logs, fixtures and screenshots.
- Add ordered, additive Kysely migrations. Separate runtime and migration
  credentials, run schema changes explicitly and exercise real PostgreSQL.
  Keep local, test and production targets separate.
- Update the milestone plan, matching docs and ADRs for consequential decisions.
  Review affected behavior at the unit, database and user-journey levels.
  Keep dev, build, migrate and test usable on PowerShell and macOS.
- The lead assigns bounded work, checks actual diffs, reproduces important
  evidence, integrates and owns commits. Use independent review for persistence
  and access-control changes. Report unrun checks as such. Get authorization
  before external actions beyond the assignment.

Use [the contributor guide](CONTRIBUTING.md) for review and prerequisites, and
[the README](README.md) for the commands developers run.
