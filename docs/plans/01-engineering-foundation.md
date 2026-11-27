# Work order 01 — Engineering foundation for Codex

Status: queued; the implementation is not yet complete.

## Objective

Turn the existing ArchiMesh skeleton into a well-documented, reproducible, agent-maintainable TypeScript project. Establish practical Codex orchestration and quality gates before feature development. Preserve the existing React/Vite, Fastify, Kysely, PostgreSQL, pnpm and GitHub Actions architecture and GPLv3 license. Do not implement the product features in this PR.

## Deliverables

- Expand root AGENTS.md into concise durable working agreements: module boundaries, strict TypeScript, shared contracts, safe SQL and migrations, authorization, security, testing, dependency hygiene, documentation, and completion criteria. Link to deeper guides instead of duplicating them.
- Create CONTRIBUTING.md: setup, branching, review, coding standards, dependency updates, migration rules, test tiers, issue/PR conventions, documentation and contribution licensing. Preserve the existing GPLv3 LICENSE; do not relicense.
- Rewrite README.md as the public product introduction and honest current status, architecture overview, Windows-native quickstart, optional Docker instructions, test commands, troubleshooting, and links to plans, ADRs and contribution guidance.
- Keep .github/copilot-instructions.md aligned with AGENTS.md. Add a useful PR template and SECURITY.md if appropriate; do not promise a security contact or SLA that has not been agreed.
- Add a concise engineering handbook and a living execution-plan convention (e.g. docs/development/workflow.md and docs/plans/README.md). Include milestone, acceptance criteria, assumptions, decisions, dependencies, progress, evidence and recovery notes.
- Establish repo-local Codex custom agents using supported .codex/agents/*.toml configuration, and reusable skills using .agents/skills/<name>/SKILL.md with valid name/description frontmatter. Check the installed Codex version and current official docs; do not invent hooks, permissions or formats. Keep instructions short and executable; use the built-in skill authoring workflow if available.
  - Agents: architect/planner, backend implementer, frontend implementer, test engineer, independent quality/security reviewer, documentation engineer. Use read-only roles for design/review where supported; no autonomous pushing or merging by subagents.
  - Skills: feature-design, implementation, database-migrations, test-and-verify, security-review, documentation, handoff. Consolidate overlapping skills. Each explains when to use it, inputs, steps, checks and output.
  - Root orchestrator owns the plan, integration, commits and final verification. Delegate bounded tasks; parallelize independent read-only design, review and test analysis; coordinate writes via non-overlapping ownership or isolated worktrees. Never let multiple agents edit shared files without coordination. Review actual diffs and reproduce important claims; do not accept a subagent's self-report as test evidence. Limit concurrency and avoid recursive delegation or idle polling. If custom agents cannot be loaded during this session, follow their roles sequentially and record that limitation.
- Keep AGENTS.md, workflow guides, skills, plans and CI complementary rather than repetitive. Use actual package scripts and avoid scaffold bloat.

## Windows without Docker (blocking usability requirement)

The current README assumes Docker and POSIX shell commands; this must change. Target native Windows (PowerShell) with the existing Node 22 LTS/pnpm and PostgreSQL 16 baseline (current CI/Compose; keep the major version consistent). Docker remains optional for other environments and Azure builds.

1. Preflight Node, pnpm, PostgreSQL client/server binaries, existing local DB availability, ports, and permissions. Never modify a non-project database.
2. Prefer an existing authorized local PostgreSQL instance; otherwise support a project-local native PostgreSQL cluster using official Windows binaries, initdb and pg_ctl, bound to loopback with isolated data and configurable port, non-admin app role, random local credentials and an ignored data directory. Document official PostgreSQL Windows installer/portable binary options, version/checksum verification and the manual fallback. If an official package is obtainable within allowed tool permissions, automate safe setup; no unapproved elevation, global service changes, firewall edits, or arbitrary download/execute scripts. Do not replace PostgreSQL with SQLite, mocks or an in-memory database to claim success.
3. Add cross-platform scripts or documented PowerShell commands for setup/start/stop/status, environment loading, migrations, tests and application startup. Make commands idempotent and safe; do not delete data by default. Keep secrets in ignored files and validate that the database is disposable before test reset. A dev database role and a test database must be separate from any production or personal database. Tests must use real PostgreSQL for SQL behavior.
4. Azurite can run natively through npm/pnpm when attachments are needed; it must not be required for the initial product unless actually used. Do not require WSL, Docker, paid AI services or Azure.
5. Keep existing Docker/CI paths working; add a Windows-oriented smoke verification or CI coverage using supported native tooling when feasible. No fabricated test pass when native Windows is not available. Preserve existing tests and improve them where needed.

## Quality and orchestration contract

Use an execution plan that survives compaction/restarts. Start each milestone with acceptance criteria and an explicit file ownership map for any parallel work. Prefer red/green/refactor for behavior, real integration tests for persistence and authorization, and Playwright for user-visible journeys. Require positive and negative tests; include cross-workspace leakage, stale revisions and rollback when product implementation begins. Use dependency boundary checks where practical.

Run the existing relevant commands: frozen install, formatting check, lint, typecheck, unit tests, build, migrations, and browser tests with a real test database. Add a single documented aggregate verification command if helpful. Do not weaken assertions, disable checks, hide errors, or label skipped checks as passed. Document exact observed results and environment constraints.

For the authorized overnight implementation, do not stop for routine choices or seek approval between milestones. Choose reversible defaults and record assumptions in the plan/ADR. If a capability is unavailable, skip or defer only that dependent task, work on independent tasks, and report a concrete recovery path. Never bypass sandbox or OS permissions; never access production data, provision Azure, publish packages, change repo visibility or license, merge to main, or rewrite existing remote history.

## Completion

Commit this work to the existing PR head branch. Update this work order or a linked execution log with actual files changed, verification results, known limitations and remaining work. Keep the application skeleton runnable. Leave the PR open for human review. After this milestone, the parent Codex session should integrate the foundation into the stacked product PR branch and continue there without waiting for a human merge.

References: https://developers.openai.com/codex/ (follow current subagent and skill docs), https://www.postgresql.org/download/windows/, the existing ADR 0001 and CI configuration.
