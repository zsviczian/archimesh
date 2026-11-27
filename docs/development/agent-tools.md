# Local CLI and MCP

Start the [native development stack](../../README.md#run-locally-on-windows) and seed the synthetic model with `corepack pnpm db:seed`. The API normally listens on `127.0.0.1:3000`. Select `architect`, `contractor-procurement`, or `contractor-integration` explicitly in `ARCHIMESH_IDENTITY`. Each identity sees the same scopes and revisions it would see in the workbench.

Set `ARCHIMESH_API_URL` when running on another port. The clients require a numeric loopback HTTP address and reject redirects. They call the model API and need no database credentials. The synthetic identity mode is for local development and is disabled in production.

## Find and propose reuse

Run these commands in PowerShell from the repository root with the API running. Use `--silent` when piping the CLI result as JSON.

```powershell
$env:ARCHIMESH_IDENTITY = 'contractor-procurement'
$search = corepack pnpm --silent model:cli search --scope shared --type capability --q 'Supplier Onboarding' | ConvertFrom-Json
$capability = $search.items | Where-Object { $_.title -eq 'Supplier Onboarding' }
$reuse = corepack pnpm --silent model:cli providers --id $capability.id | ConvertFrom-Json
$provider = $reuse.providers | Where-Object { $_.object.title -eq 'Supplier Harbor North' }
$provider | ConvertTo-Json -Depth 12
```

The result ties Supplier Harbor North to Supplier Onboarding through a `supports` relationship. Keep both the provider revision and relationship revision with a reuse recommendation. Retrieve the source Markdown with `model:cli get --id <UUID>` and inspect other links with `model:cli neighborhood --id <UUID>`. Review `partial` and `nextCursor` before drawing conclusions from a result. A contractor’s search describes the contractor’s accessible model.

The following draft proposes adding that recommendation to the Procurement Modernization project. It validates the proposed batch, then stores it as a scenario. The original project revision stays current until someone separately applies a change through the workbench API.

```powershell
$projects = corepack pnpm --silent model:cli search --scope procurement --type project --q 'Procurement Modernization' | ConvertFrom-Json
$project = corepack pnpm --silent model:cli get --id $projects.items[0].id | ConvertFrom-Json
$operations = @(@{
  kind = 'update'
  id = $project.id
  expectedRevisionId = $project.revisionId
  markdown = $project.markdown + "`n## Supplier onboarding reuse`n`nReuse $($provider.object.title) for supplier validation. Evidence relationship revision $($provider.relationship.revisionId).`n"
})
$validate = @{ requestId = [guid]::NewGuid().ToString(); operations = $operations }
$draft = @{ name = 'Reuse Supplier Harbor'; scopeId = 'procurement'; operations = $operations }
[IO.File]::WriteAllText((Join-Path (Get-Location) '.local/reuse-validation.json'), ($validate | ConvertTo-Json -Depth 10))
[IO.File]::WriteAllText((Join-Path (Get-Location) '.local/reuse-scenario.json'), ($draft | ConvertTo-Json -Depth 10))
$validation = corepack pnpm --silent model:cli validate --file .local/reuse-validation.json | ConvertFrom-Json
$validation
if ($validation.valid) {
  $scenario = corepack pnpm --silent model:cli draft --file .local/reuse-scenario.json | ConvertFrom-Json
  $headers = @{ 'x-archimesh-identity' = $env:ARCHIMESH_IDENTITY }
  $comparison = Invoke-RestMethod -Headers $headers -Uri "http://127.0.0.1:3000/api/model/scenarios/$($scenario.id)"
  $comparison.changes[0] | ConvertTo-Json -Depth 10
}
```

The comparison includes the actual revision and proposed Markdown. On macOS, use `export ARCHIMESH_IDENTITY=contractor-procurement` and the same CLI commands with your shell’s JSON tooling.

## Connect a local MCP host

Build once with `corepack pnpm build`. Configure the host to launch `node` with the absolute path to `apps/server/dist/tools/mcp.js` as its argument and set `ARCHIMESH_IDENTITY` in the child environment. Point `ARCHIMESH_API_URL` at a local API if needed. Invoke the compiled server directly because launchers that print banners to stdout interfere with the stdio protocol.

The official Apache-2.0 TypeScript SDK serves eight tools over stdio. Each tool uses the same model API as the workbench.

| Tool                        | Result                                                               |
| --------------------------- | -------------------------------------------------------------------- |
| `search_objects`            | One page of authorized object summaries with an optional next cursor |
| `get_object`                | Canonical Markdown, metadata, and revision for an accessible object  |
| `get_neighborhood`          | Bounded one-hop graph with a partial-result flag                     |
| `get_metamodel`             | Versioned types and allowed relationship endpoints                   |
| `find_capability_providers` | Visible providers and the `supports` relationship revisions          |
| `validate_changeset`        | Validation results before saving                                     |
| `create_changeset`          | A draft scenario and its pinned baseline                             |
| `export_context`            | Authorized OKF files as JSON with a pinned context in `index.md`     |

The tools treat Markdown as untrusted content. Use scope and type filters for context packs. The CLI limits API payloads to 1 MiB and MCP limits tool results to 256 KiB before protocol encoding.

To exercise the real MCP subprocess against the running seeded API on Windows, run the following. Set the same variable with `export` on macOS. The fixture tests run independently and the PostgreSQL smoke test runs when the URL is set.

```powershell
$env:ARCHIMESH_TEST_MODEL_TOOLS_URL = 'http://127.0.0.1:3000'
corepack pnpm --filter @archimesh/server exec vitest run src/tools/tools.test.ts
```
