# Execution plans

Work orders record intent. A linked execution record captures progress and
survives context compaction or handoff. Update it after each meaningful
checkpoint and before switching branches.

| Work order                                             | Relevant evidence                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [Engineering foundation](01-engineering-foundation.md) | [Foundation execution record](../development/foundation-execution.md)                              |
| [ArchiMesh v0.1](02-archimesh-v0.1.md)                 | [Execution record](../development/v0.1-execution.md) and [handoff](../development/v0.1-handoff.md) |

## Execution record outline

- **Milestone and baseline.** Branch, work order, dependents and current checkpoint.
- **Acceptance.** Observable behavior, verification needed and parallel file ownership.
- **Decisions and assumptions.** Record rationale and link architectural decisions.
- **Completed and remaining.** Identify what is integrated and what is pending.
- **Evidence.** Exact command, environment, observed result and artifact location.
- **Recovery.** Known blockers, safe recovery and next actionable step.
