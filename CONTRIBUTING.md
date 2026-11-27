# Contributing to ArchiMesh

## Setup

Start with the [README](README.md) and [native PostgreSQL guide](docs/development/native-postgresql.md). Use the repository's pinned pnpm, PostgreSQL 16, and synthetic data. Read [AGENTS.md](AGENTS.md) for working agreements and the [engineering workflow](docs/development/workflow.md) for design, implementation, review, and handoff.

## Issues and pull requests

- For a bug, include the affected commit, environment, observed behavior, and expected behavior. Use the [security reporting process](SECURITY.md) for vulnerabilities.
- For a feature, describe the user workflow, expected outcome, and acceptance criteria. Record consequential architecture decisions in `docs/adr`.
- Branch from the intended integration branch. For stacked work, target the parent branch and link the dependency in the PR. Keep commits small and coherent.
- Open a draft PR when early review would help. Link the issue or plan, summarize the change, and include the exact checks run and any remaining gaps. Request an independent review for changes to security, persistence, or public contracts.
- Keep documentation and behavior together. Update setup instructions, examples, contracts, and migrations when the change affects them.

## Code and dependencies

Keep TypeScript strict and validate inputs at boundaries. Reuse shared API contracts, define authoritative behavior in the server or domain layer, and keep UI code independent of persistence. Follow [AGENTS.md](AGENTS.md) for module and authorization rules.

Before adding a dependency, check whether existing code or the platform already covers the need. Review the dependency's maintenance, license compatibility, security, and transitive cost. Change the package manifest and lockfile together, then run a frozen install to verify it. Keep dependency updates focused and record any behavior or deployment change.

## Database migrations

Place ordered JavaScript ES modules in `apps/server/migrations` so Kysely can load the same files in development and in the container. Use descriptive, unique filenames and export an async `up(db)`. Provide `down(db)` when a safe inverse exists and document recovery for lossy changes. Add a forward migration to correct one that has already shipped.

Review constraints, indexes, locks, and effects on existing rows. Verify the migration in an empty database and, when existing data is affected, in an isolated database with representative synthetic records. Treat data backfills and rollback plans as part of the change. Use the migration role for schema changes and the runtime role for the application.

## Verification tiers

| Command                      | Coverage                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| `corepack pnpm format:check` | Prettier formatting                                                         |
| `corepack pnpm lint`         | ESLint checks                                                               |
| `corepack pnpm typecheck`    | Strict TypeScript checks                                                    |
| `corepack pnpm test`         | Vitest source tests                                                         |
| `corepack pnpm build`        | Workspace build and production bundle                                       |
| `corepack pnpm verify`       | All of the preceding source checks                                          |
| `corepack pnpm test:db`      | Native PostgreSQL verification with distinct development and test databases |
| `corepack pnpm test:e2e`     | Playwright browser journeys against the migrated test database              |

Add focused coverage at the layer where the behavior can regress. Use real PostgreSQL for transactional behavior, permissions, and SQL constraints. Cover denied requests and rollback for relevant mutations, and include browser coverage for critical user journeys. Report the operating system, database version, test counts when available, and checks that could not run.

## Licensing

Submit code and assets you have the right to contribute under the project's [GPLv3 license](LICENSE). Preserve third-party notices where required. Use fictional people, systems, and organizations in all test fixtures, screenshots, and demonstrations.
