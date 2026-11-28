# ADR 0002 — Canonical knowledge and scoped access

Accepted for the local v0.1 demo.

## Context

The workbench, SQL queries, diagrams and agent tools need to agree on the same
objects, including first-class relationships and earlier versions. A contractor
needs to reuse shared architecture while remaining confined to an assigned
project. The local implementation must work on native PostgreSQL 16.

## Decision

Pin the [OKF 0.3 specification](https://github.com/open-knowledge-format/open-knowledge-format/blob/527e81aff55992be21507e97004286789126f88c/SPEC.md).
Store original Markdown and immutable revision metadata in PostgreSQL. The
namespaced `x-archimesh-model` extension carries stable UUID, model attributes,
typed references, optional effective-time dates and saved view membership.
Top-level descriptive data and the document body are preserved. Trusted scope,
actor, commit order and audit timestamps come from the command and database.
The application accepts the current metamodel shipped as data in core.

A command validates its entire proposed graph after establishing a
transaction-scoped actor and locking the model. It checks expected revisions,
then writes the commit receipt, immutable revisions and searchable current
projections in the same transaction. Deferred foreign keys allow forward
references within a changeset. Retiring a document retains its identity and
history. The constrained loopback demo has one shared catalog and two
isolated workspaces. A typed reference may target the owner's scope or shared
catalog. Shared writes require the architect. The scope rule holds for
relationship endpoints, including other relationships, and for saved views.

Reads run in consistent snapshots through PostgreSQL forced RLS. The runtime
role cannot own model tables, bypass RLS or alter grants and earlier
revisions. The server sets the actor transaction-locally and separately
enforces writable scope, graph invariants and input limits. Only tracked
API paths can infer identity from a local demo header. The database
credentials are trusted infrastructure credentials.

A saved view is a document with its own layout revisions. Moving a visual
member preserves the member's canonical revision. Historical queries can
filter by UTC recorded timestamp and half-open effective calendar intervals.
Draft scenarios persist a pinned baseline and a proposal diff separately
from actual architecture. They have no publication operation in v0.1.

## Consequences

The stable local model can be exported as a bounded OKF bundle with a
revision manifest. Reimport is create-only, architect-gated and transactional.
A filtered pack can refer to documents already in the destination model.
Prioritize versioned workspace grants and verified Entra principals before
deployment. Cross-workspace sharing, object-level rules, configurable
metamodel publishing, long-running projection rebuilds and scale benchmarks
need separate designs and acceptance tests.
