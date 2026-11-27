# ADR 0001: Modular monolith and authoritative PostgreSQL

Status: accepted.

## Context

The platform needs a consistent local and cloud architecture, a foundation for
large interconnected knowledge collections, and independent evolution of UI,
domain logic, and integrations without prematurely splitting services.

## Decision

Use a pnpm TypeScript monorepo with a React frontend and Fastify backend.
Use PostgreSQL as the authoritative repository and Kysely for SQL and
versioned migrations. Canonical Markdown and indexed metadata will eventually
reside in PostgreSQL; Git will support distribution and interchange. Use
shared Zod contracts at API boundaries and expose OpenAPI. Docker Compose
provides local PostgreSQL and Azurite.

## Consequences

Local development needs no cloud subscription. Database schema changes must use
ordered migrations; Git is not a substitute for database persistence. The
monolith can later gain modules and integrations without a distributed system
being required now. Scalability, authorization, OKF semantics, and migration
of real knowledge require separate designs and tests.
