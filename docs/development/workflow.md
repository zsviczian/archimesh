# Engineering workflow

1. Locate the work order and ADRs. Write observable acceptance criteria and
   identify risks, especially identity, transaction boundaries and migration
   compatibility. Record the current branch, dependencies and the next action.
2. The lead assigns disjoint paths or isolated worktrees. Give each specialist
   a baseline, task, owned files and expected verification. Independent
   design, test analysis and review can run alongside implementation. Keep
   shared contracts and integration under one owner. Subagents report findings
   and commands to the lead. The lead owns Git history and delivery.
3. Implement in runnable vertical slices. Validate HTTP input and authorization
   at the server, then keep the command, projections and audit atomic. Use an
   ADR for consequential changes. Keep user docs updated alongside behavior.
4. Run `pnpm verify`, `pnpm test:db`, `pnpm db:migrate` and
   `pnpm test:e2e` as applicable. Prefer focused unit cases for domain
   decisions, real SQL fixtures for data consistency and access, and browser
   journeys for work users perform. For access changes, cover both permitted
   behavior and hidden records across every read path. Reproduce core results
   after integration and visually review changed screens.
5. Request independent quality/security review for changes to data or access.
   Check the actual diff against the acceptance criteria. Treat stale writes,
   partial failure and denied access as regression cases. Record actual
   commands and outcomes, outstanding risks and any deferred scope in the
   execution record and PR.

## Codex setup

[Custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
are standalone TOML files in `.codex/agents/`.
[Skills](https://learn.chatgpt.com/docs/build-skills) are instruction-only
`SKILL.md` files in `.agents/skills/`. Use a trusted project session from
this repo. Select a matching skill and delegate to a matching specialist.
Design and review roles are instructed to stay read-only and inherit the
parent session's permissions. Keep coordination in the lead session and avoid
nested delegation. If the current session cannot discover newly added roles,
delegate using explicit role instructions or perform the passes sequentially
and record the method used.

## Boundaries

| Area                 | Owns                                        | May depend on                         |
| -------------------- | ------------------------------------------- | ------------------------------------- |
| `packages/core`      | Domain rules and canonical knowledge        | General-purpose domain libraries      |
| `packages/contracts` | Wire DTOs and schemas                       | Schema libraries                      |
| `apps/server`        | Use cases, access policy, persistence, HTTP | Core, contracts and platform adapters |
| `apps/web`           | Browser experience                          | Contracts and browser libraries       |

Architecture and dependency changes should explain the problem, alternatives,
decision and operational consequences. Start with
[ADR 0001](../adr/0001-foundation.md).
