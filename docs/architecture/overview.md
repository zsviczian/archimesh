# ArchiMesh architecture

ArchiMesh is a modular TypeScript monolith. The React workbench and local CLI
and MCP adapters call the same Fastify API. PostgreSQL stores immutable OKF
Markdown and transactionally maintained SQL projections.

| Boundary             | Responsibility                                                                       |
| -------------------- | ------------------------------------------------------------------------------------ |
| `packages/core`      | Pinned OKF profile, safe YAML, metamodel and endpoint rules                          |
| `packages/contracts` | Zod wire types and command validation                                                |
| `apps/server`        | Local identity gate, application commands, queries, migrations and projection writes |
| `apps/web`           | Catalog, Markdown editing, graph and saved views                                     |
| `infra`              | Local Compose and planned Azure deployment                                           |

Each model command establishes identity and scope in a transaction, validates
the proposed graph and atomically commits revisions and projections.
Relationships have their own stable IDs, lifecycle, ownership and history.
Saved layouts use separate view documents. The demo scenario overlay stores
a pinned baseline and proposed changes alongside the actual model.

The runtime PostgreSQL role is separate from the migration role. Row policies
apply at query time and the server restricts typed references across scopes.
The UI disables active HTML and external media when displaying Markdown.
CLI and MCP use loopback HTTP and a configured demo identity.

See [ADR 0001](../adr/0001-foundation.md) for the foundational stack,
[ADR 0002](../adr/0002-canonical-knowledge-and-scope.md) for model semantics and
the [Azure direction](../../infra/azure/README.md) for future deployment.
