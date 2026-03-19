# CLAUDE.md — mcp-einvoice

## Project
MCP server for French e-invoicing (Iopole adapter). Deno + TypeScript + React viewers.
43 tools, 5 viewers (invoice, doclist, timeline, directory-card, action-result).

## Commands
- `deno task serve` — HTTP mode on port 3015
- `deno task test` — run tests
- `deno task inspect` — launch MCP Inspector
- `cd src/ui && node build-all.mjs` — rebuild all viewers (required after TSX changes)
- Run from project root, not src/ui/ (server.ts won't be found otherwise)

## Git
- Use GitButler CLI (`but`) for commits, never `git commit`
- Small fixes: `git push origin <sha>:refs/heads/main` (skip PR)
- Features: `but commit` → `git push origin <sha>:refs/heads/<branch>` → `gh pr create` → `gh pr merge`
- `but push` often fails with stale branches — push SHA directly via git

## Iopole API
- **Local API specs**: `docs/api-specs/` — 6 OpenAPI JSON specs (operator-invoicing, operator-config, operator-reporting, operator-edi, platform, stats)
- **Reference doc**: `src/adapters/README.md` — complete endpoint inventory, lifecycle, enums, sandbox behavior
- Sandbox API: api.ppd.iopole.fr/v1, Auth: auth.ppd.iopole.fr (NOT auth.iopole.com)
- Factur-X generate returns binary PDF — use `postBinary()`, NOT `request()` (corrupts binary via text encoding)
- Search valid Lucene fields: senderName, receiverName, invoiceId (NOT status, direction, seen)
- Entities must be registered on DOMESTIC_FR network before invoices route (WRONG_ROUTING otherwise)
- Enrollment requires both siret AND siren
- Sandbox entities: BRASSILA NAPPUS (47846336700019), FABRICE ALFIER (79889661900011)
- `getInvoice` returns NO state field — status enrichment via `Promise.all(getInvoice, getStatusHistory)`
- INBOUND copies have no status history — fallback to row data from search
- Sandbox has active webhook → `notSeen` always empty (PUSH mode). Disable webhook to test PULL.
- `seen` field not exposed in search/getInvoice — opaque mechanism, only via `notSeen` endpoint

## Viewers (MCP Apps)
- Viewers are React single-file HTML bundles in src/ui/dist/
- After editing any TSX: must run `node build-all.mjs` AND rebuild dist
- New viewers auto-discovered by build BUT must be registered in server.ts registerViewers()
- callServerTool = for actions (result stays in current viewer) and drill-down (inline detail panel)
- sendMessage = for navigation (triggers new conversation turn + new viewer in Claude Desktop)
- callServerTool works in MCP Inspector, sendMessage does not
- Status badges: use only real Iopole statuses (no legacy aliases, "submitted" not "deposited")
- Doclist inline drill-down: chevron ▶, expandable panel, auto-detects invoice vs generic data
- `consumeToolResult` guard: only consumes results with `data[]` or doclist markers (`_title`, `_rowAction`, `count`)

## Code Patterns
- Tool handlers return JSON with `_title` for doclist heading and `_rowAction` for drill-down
- `normalizeInvoiceForGenerate()` adds EN16931 required fields (postalAddress, electronicAddress)
- Use `mapToViewerPreview(inv)` with normalized invoice, not raw input
- `Number(amount).toLocaleString("fr-FR")` — coerce to number before locale formatting
- ActionButton `confirm` prop = double-click pattern for destructive actions
- GENERATE_AX_HINT in tool descriptions guides LLM to check entities before generating
- Status fallback in doclist drill-down: row["Statut"] used when getInvoice has no status

## Testing
- E2E via deno eval: `import { EInvoiceToolsClient } from "./src/client.ts"`
- MCP Inspector: `deno task serve` + inspector on http://localhost:6274, connect Streamable HTTP to localhost:3015/mcp
- Test harness: src/ui/dist/test-harness.html (deleted by builds, recreate if needed)
- generated-store: 10min TTL, in-memory only, lost on restart
