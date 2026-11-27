# Azure deployment direction

This is a future architecture, not a deployment template. No Azure resources
are provisioned here.

- Run the application image in Azure Container Apps, sourced from Azure
  Container Registry.
- Use Azure Database for PostgreSQL Flexible Server as the authoritative store
  and Azure Blob Storage for future attachments.
- Integrate Microsoft Entra ID for authentication and enforce authorization
  server-side, including a separately designed PostgreSQL RLS strategy.
- Use Azure Key Vault for secrets and Azure Monitor for telemetry.
- Define infrastructure using Bicep once deployment requirements are agreed.

The image already supports an external PostgreSQL connection. Before deployment,
design TLS and private networking, identity and least privilege, secret
injection, migration execution, backups and recovery, observability, and
scaling. The current unauthenticated skeleton is not ready for public use.
