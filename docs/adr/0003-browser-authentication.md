# ADR 0003 — Browser authentication modes

ArchiMesh needs authenticated browser access from a second machine while the
workbench is still using synthetic data. Real Microsoft Entra integration
must be testable without a hosted development tenant.

Use a single HTTPS origin for the compiled browser client and Fastify server
in network modes. The server owns sign-in and assigns an existing model
actor before invoking the same transaction-scoped PostgreSQL policies.
Keep the three loopback demo identities for development. An authenticated
LAN lab uses one random per-host passphrase and an adapter that only accepts
the bound private interface and its subnet.

Use short-lived, single-use OIDC flow records and opaque server-side browser
sessions. Protect the cookies with HTTPS, HttpOnly and a host prefix. Require
the configured origin on writes. The Entra provider maps verified directory
object IDs to distinct existing actors. Use the maintained openid-client
library for OIDC and signature validation. Test against a signed local issuer
fixture and keep live Entra rollout as a separate acceptance requirement.

LAN mode uses a host-specific certificate created locally. Transfer the
public certificate separately. The issuing key is removed after setup.
The production integration requires an appropriate certificate, explicitly
configured principals and a tenant-backed acceptance run.
