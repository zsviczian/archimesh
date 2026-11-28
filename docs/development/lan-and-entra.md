# LAN access and Entra ID

ArchiMesh has separate modes for loopback development, an authenticated LAN
demo, and Entra-backed sign-in. The LAN demo and Entra modes serve the compiled
workbench and API together over HTTPS. PostgreSQL can continue listening on
loopback. Opening the PostgreSQL port is unnecessary for either mode.

## Open an existing LAN demo

1. Copy only `.local/lan/archimesh-lan-ca.cer` from the host to the client PC
   over a channel you already trust. Compare the file's SHA-256 hash on the two
   computers before trusting it. The certificate is public.
2. On a Windows client, trust that certificate in your current user's root
   store. Run these commands in PowerShell from the folder containing the
   copy. Use the client browser's certificate settings if it manages its own
   trust store.

   ```powershell
   Get-FileHash -Algorithm SHA256 .\archimesh-lan-ca.cer
   certutil -user -addstore Root .\archimesh-lan-ca.cer
   ```

3. From the client on the same subnet, browse to the HTTPS IP address printed
   by LAN setup. Enter the generated access passphrase from the host's
   `.local/lan/password.txt`. Keep the passphrase and server private key on
   trusted devices.

## Start a LAN demo on the host

Start and seed the [native test model](../../README.md#run-locally-on-windows).
On a host with OpenSSL, use its assigned private IPv4 address the first time
you set up LAN access. Git for Windows includes a supported OpenSSL binary.
With a custom installation, set `OPENSSL_BIN` to the executable.

```powershell
corepack pnpm lan:setup 192.168.1.20
corepack pnpm lan:start
```

Setup creates an IP-specific certificate and a generated passphrase under
ignored `.local/lan/`. The process binds to that interface on TCP 3443 and
checks the peer's subnet. It accepts one lab account assigned to Architect.
Use it for the synthetic demo. A browser session expires after eight hours
or when the server stops. Press Ctrl+C to stop the server. Run
`corepack pnpm lan:start` to start it again using the same certificate and
password.

On Windows, the host firewall needs an inbound exception if it blocks the
connection. Scope it to TCP 3443, the host IP, the chosen interface, and
the local subnet. Router port forwarding is unnecessary. A guest network
that isolates peer devices also prevents access. If DHCP changes the host
address or the certificate expires, stop the server, move the old ignored
`.local/lan` folder aside and run setup with the current address. Trust the
replacement public CA on each client and remove the retiring CA from the
client trust store.

## Configure Microsoft Entra ID when a tenant is available

Use a single-tenant **Web** app registration. Configure the exact HTTPS
redirect URI `<ARCHIMESH_ORIGIN>/api/auth/entra/callback` and give the server
a certificate for that origin. The app uses tenant-specific discovery and
authorization code with S256 PKCE, one-time state, and a nonce. It validates
the ID token signature, issuer, audience, and lifetime. The configured tenant
and the directory object ID determine the server-side actor assignment.
Usernames and browser-selected identities have no role in that mapping.
[Microsoft OpenID Connect guide](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)

Set these values through the process environment or deployment secret store.
Set `HOST` explicitly for the application interface. If `PORT` is supplied,
match the origin port unless an HTTPS reverse proxy handles that translation.
The server expects the public host header and an HTTPS connection on its side
of any proxy.

| Variable                                                 | Value                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ARCHIMESH_AUTH_MODE`                                    | `entra`                                                                                    |
| `ARCHIMESH_ORIGIN`                                       | HTTPS origin, e.g. `https://architecture.example.com`                                      |
| `ARCHIMESH_HTTPS_CERT_FILE`, `ARCHIMESH_HTTPS_KEY_FILE`  | Server PEM certificate and private key                                                     |
| `ARCHIMESH_ENTRA_TENANT_ID`, `ARCHIMESH_ENTRA_CLIENT_ID` | Directory and app registration UUIDs                                                       |
| `ARCHIMESH_ENTRA_CLIENT_SECRET`                          | App registration secret from the deployment secret store                                   |
| `ARCHIMESH_ENTRA_ACTORS`                                 | JSON object mapping Entra directory object UUIDs to distinct existing ArchiMesh identities |

Build with `corepack pnpm build` and run `node apps/server/dist/index.js`
from the workspace. The browser displays **Sign in with Microsoft** in this
mode. The current repository has three actor slots. The explicit one-to-one
mapping is suitable for initial tenant validation. Directory-wide use needs
durable per-user principal provisioning, shared session storage for multiple
instances, and audited access administration. Signing out ends the
ArchiMesh session. Microsoft single sign-on is managed by Entra.

The automated OIDC fixture covers signed tokens, issuer and audience checks,
state and nonce, expiry, and mapped versus unmapped identities without
tenant credentials. A real Entra login, Conditional Access, and deployment
through an Azure proxy remain tenant acceptance tests.
