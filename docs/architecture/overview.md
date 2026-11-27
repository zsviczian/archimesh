# Architecture overview

Archimesh is a TypeScript modular monolith. `apps/web` is the React/Vite UI;
`apps/server` is the Fastify REST API and database boundary.
`packages/contracts` contains shared validated API contracts, and
`packages/core` is reserved for domain logic when it is needed. The health
route checks PostgreSQL and exposes an OpenAPI document. The browser uses
TanStack Query and a same-origin API; Vite proxies that API during development.

The intended knowledge repository uses PostgreSQL as the authoritative store
for canonical Markdown with YAML frontmatter, indexed metadata and relationships.
Google Open Knowledge Format (OKF) is the intended interchange representation;
Git is for distribution and interchange rather than the primary database.
These representations and synchronization are not implemented yet.

The design targets hundreds of thousands of architectural objects and
relationships and up to 1,000 users. Indexing, pagination, concurrency,
data isolation, and performance testing will be required as real features are
added; the skeleton makes no scalability guarantees.

Authentication, authorization and PostgreSQL RLS, temporal modeling, metamodel
validation, diagrams, Markdown editing, agent interfaces, attachment storage,
and reporting are future work. The current API is unauthenticated and must not
be exposed to untrusted users.
