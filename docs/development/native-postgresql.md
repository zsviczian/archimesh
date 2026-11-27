# Native PostgreSQL development

Run these commands from the repository root with Node.js 22 LTS and Corepack. ArchiMesh uses PostgreSQL 16 on Windows, macOS, and CI. The project-managed cluster uses a data directory under ignored `.local/`, binds to `127.0.0.1` on port `55432` by default, and runs under your current user. It needs no system service, firewall rule, or elevated shell.

## Windows PowerShell

Inspect existing tools and the proposed port.

```powershell
node --version
corepack pnpm --version
Get-Command postgres, initdb, pg_ctl, psql -ErrorAction SilentlyContinue
Get-Service '*postgres*' -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction SilentlyContinue
```

If an existing PostgreSQL 16 installation is suitable, reuse its binaries for the project cluster. Set `PG_BIN` to the directory containing `postgres.exe`, `initdb.exe`, `pg_ctl.exe`, and `psql.exe` if they are outside PATH. The path below is an example for an existing EDB installation.

```powershell
$env:PG_BIN = 'C:\Program Files\PostgreSQL\16\bin'
& (Join-Path $env:PG_BIN 'postgres.exe') --version
```

For x64 Windows without PostgreSQL, download the PostgreSQL 16 Windows x86-64 binary ZIP and matching SHA-256 checksum from [EDB's binary downloads](https://www.enterprisedb.com/download-postgresql-binaries), linked from [PostgreSQL's Windows download page](https://www.postgresql.org/download/windows/). Choose the current PostgreSQL 16 patch. Save both files to the same directory and adjust the filename in this example for your download.

```powershell
$archive = "$env:USERPROFILE\Downloads\postgresql-16.16-2-windows-x64-binaries.zip"
$expected = ((Get-Content -LiteralPath "$archive.sha256" -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or $actual -ne $expected) {
  throw 'PostgreSQL archive checksum mismatch'
}
Expand-Archive -LiteralPath $archive -DestinationPath .local/postgresql
& .\.local\postgresql\pgsql\bin\postgres.exe --version
```

If the archive layout differs, set `PG_BIN` to the extracted `bin` directory. If the binaries cannot run on your Windows installation, use a machine with the supported runtime or consult the [EDB installer guide](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/) for a managed installation. The installer can change services and may require administrator approval.

## macOS

With Homebrew already available, install the [PostgreSQL 16 formula](https://formulae.brew.sh/formula/postgresql@16) and point the project at its binaries. Skip installation when an appropriate PostgreSQL 16 installation is already available. PostgreSQL also lists [macOS package options](https://www.postgresql.org/download/macosx/).

```sh
brew install postgresql@16
export PG_BIN="$(brew --prefix postgresql@16)/bin"
"$PG_BIN/postgres" --version
```

Continue with the shared commands below. ArchiMesh starts its own cluster, so a Homebrew service is optional. See the [engineering foundation plan](../plans/01-engineering-foundation.md) for platform verification.

## Set up, run, and stop

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:local setup
corepack pnpm db:local status
corepack pnpm db:migrate
corepack pnpm dev
```

Setup creates isolated development and test databases with generated credentials in ignored `.env`. `DATABASE_URL` is for dev runtime access and `MIGRATION_DATABASE_URL` is for dev schema changes. `TEST_DATABASE_URL` and `TEST_MIGRATION_DATABASE_URL` serve the same roles for the isolated test database. The commands read the repository's `.env` automatically. Keep it and the local cluster's credentials under `.local/` private.

Open <http://127.0.0.1:5173>. Press Ctrl+C to stop the app and run `corepack pnpm db:local stop` to stop PostgreSQL. Run `corepack pnpm db:local start` to restart PostgreSQL with its existing data. Use `corepack pnpm db:local status` to check the cluster.

For a port conflict at initial setup, select an unused port through `ARCHIMESH_PG_PORT`. The chosen port is recorded for subsequent starts.

```powershell
$env:ARCHIMESH_PG_PORT = '55433'
corepack pnpm db:local setup
```

```sh
ARCHIMESH_PG_PORT=55433 corepack pnpm db:local setup
```

## Reuse an authorized local instance

If you already operate an isolated PostgreSQL 16 development instance, you can supply your own URLs in `.env` and skip `db:local setup`. Provision dedicated `archimesh` and `archimesh_test` databases with appropriate migration and runtime credentials. Keep them separate from existing personal or shared data. Run `corepack pnpm db:migrate` only after confirming that the migration URL points to your project database. Test against a disposable database and verify the test URL before running anything that resets its fixtures.

## Diagnose common failures

| Symptom                                                      | Check                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm is missing from PATH                                    | Invoke it as `corepack pnpm`. Corepack resolves the version pinned in `package.json` without requiring a system-wide shim.                                         |
| PostgreSQL tools are missing or have the wrong major version | Check `PG_BIN`, then run `postgres --version` using that directory. Install or extract PostgreSQL 16 if needed.                                                    |
| PostgreSQL fails to start                                    | Check `db:local status`, the port, and the `.local/postgres.log` file. Confirm that the selected data directory belongs to the project before attempting recovery. |
| The UI reports an unavailable database                       | Start PostgreSQL and confirm the intended `DATABASE_URL` is active. Run `db:migrate` if the branch has new migrations.                                             |
| Playwright reports missing Chromium                          | Run `corepack pnpm exec playwright install chromium`. If using `PLAYWRIGHT_BROWSERS_PATH`, use the same value for installation and tests.                          |
| Playwright reports a port in use                             | Check what is using the test API port 3001 or web port 5174. Playwright starts its own server connected to the test database.                                      |

After updating PostgreSQL binaries, verify their version and run `db:local status` and `test:db`. Keep a backup before changing a database directory or upgrading across major versions. The local commands stop and start the cluster without deleting its data.
