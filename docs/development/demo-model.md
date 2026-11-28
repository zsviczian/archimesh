# Alderfen Works demo model

Alderfen Works is a fictional enterprise with North and Coastal operations. Its
seed bundle contains 5 application categories, 10 applications, 20 application
instances, 20 capabilities, 15 business objects, 50 typed relationships, 2
projects, 2 viewpoints and 2 saved views.

The seed uses the same OKF Markdown concepts as the repository. Each logical
key generates a stable object ID and `objects/<id>.md` path. A seed rerun can
identify the same records independently of their title or display order. Scope
membership is supplied separately by the seed command. Use only synthetic
data when extending this model or taking screenshots.

## Find a reusable provider

1. Search for **Supplier Onboarding** or its alias **Supplier Intake**.
2. Open the capability and follow **Supplier Harbor North provides Supplier
   Onboarding** to **Supplier Harbor North**. The provider is an operating
   application instance owned by Supplier Operations. Its relationship records
   that North Works projects can reuse the capability.
3. Open **Supplier and Order Data Responsibility** to inspect the same supplier
   application in its operational context. It creates supplier records and
   masters supplier identity for North Works. **Ledgerline North** reads that
   data and creates and updates purchase orders. The separate typed edges
   preserve each responsibility.

## Compare the procurement baseline and proposal

1. In the procurement scope, open **Procurement Modernization** and read its
   current and target sections.
2. Open **Procurement Solution Context**. The operating design has Ledgerline
   North receiving a nightly supplier feed. The proposal introduces **Purchase
   Desk North**, which would call Supplier Harbor North for supplier lookup.
3. Inspect the project impact on the legacy feed. It records a proposed
   retirement conditional on rollout and reconciliation. The shared feed
   retains its active lifecycle. The proposal is represented by draft records
   and typed impact relationships.

## Check the project boundary

The procurement scope contains its modernization project, solution context,
and proposal records. The integration scope contains **Freight Event
Integration** and its proposal to add replayable freight events for Coastal
Works. Shared records include the operating North freight route and the reusable
supplier capability. Compare the two contractor identities in the development
environment. Each can see its project and the shared catalog.
