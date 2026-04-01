# CLAUDE.md — mcp-einvoice

## Project

MCP server for e-invoicing — PA-agnostic via the adapter pattern. 3 adapters
(Iopole, Storecove, Super PDP), 39 tools, 6 viewers, BaseAdapter +
AfnorBaseAdapter hierarchy. Deno + TypeScript + React viewers. v0.2.0.

Monorepo with 3 packages:
- `packages/core/` — `@casys/einvoice-core` (adapter layer, types, shared utils)
- `packages/mcp/` — `@casys/mcp-einvoice` (MCP server, tools, viewers)
- `packages/rest/` — `@casys/einvoice-rest` (Hono REST API)

## Commands

- `deno task mcp:serve` — MCP HTTP mode on port 3015 (localhost by default)
- `deno task rest:serve` — REST API on port 3016
- `deno task test` — run all tests across all packages
- `deno task test:core` — run tests for einvoice-core only
- `deno task test:mcp` — run tests for mcp-einvoice only
- `deno task test:rest` — run tests for einvoice-rest only
- `deno task inspect` — launch MCP Inspector
- `cd packages/mcp/src/ui && node build-all.mjs` — rebuild all viewers (required
  after TSX changes)
- Run from project root (workspace root), not from a package directory

## Git

- Use plain `git` for all operations (GitButler removed)
- Small fixes: `git commit` + `git push origin main`
- Features: branch + `gh pr create` + `gh pr merge`
- CI auto-publishes to JSR + npm on push to main
- Version bump in each `packages/*/deno.json`

## Monorepo Structure

```
packages/
├── core/           # @casys/einvoice-core — adapter layer, types, shared utils
│   ├── mod.ts
│   └── src/
│       ├── adapter.ts          # EInvoiceAdapter interface + types
│       ├── adapters/           # BaseAdapter, AfnorBaseAdapter, Iopole, Storecove, SuperPDP
│       └── testing/helpers.ts  # createMockAdapter()
├── mcp/            # @casys/mcp-einvoice — MCP server, tools, viewers
│   ├── server.ts
│   ├── mod.ts
│   └── src/
│       ├── client.ts           # Tools registry + capability filtering
│       ├── tools/              # 39 tools (6 categories)
│       ├── ui/                 # 6 viewers React (single-file HTML)
│       └── testing/helpers.ts  # unwrapStructured()
└── rest/           # @casys/einvoice-rest — Hono REST API
    ├── server.ts
    └── src/
        └── routes/             # Hono routes (invoice, config, entity, etc.)
```

## Architecture

- `EInvoiceAdapter` interface (45 methods, 8 typed returns) in
  `packages/core/src/adapter.ts`
- `BaseAdapter` (abstract) in `packages/core/src/adapters/base-adapter.ts` —
  NotSupportedError stubs for all 45 methods
- `AfnorBaseAdapter` extends BaseAdapter in `packages/core/src/adapters/afnor/`
  — AFNOR XP Z12-013 socle for French PAs with AFNOR
- `AdapterMethodName` type ensures compile-time safety for capabilities
- `BaseHttpClient` in `packages/core/src/adapters/shared/http-client.ts` —
  shared HTTP logic, subclasses provide auth
- Shared: `errors.ts` (NotSupportedError, AdapterAPIError), `env.ts`
  (requireEnv), `encoding.ts` (uint8ToBase64, encodePathSegment), `oauth2.ts`
  (token provider, 15s timeout), `direction.ts` (normalizeDirection)
- Tools declare `requires: ["methodName"]` — only exposed when adapter supports
  them
- Tools return `{ content, structuredContent }` — content for LLM,
  structuredContent for viewers

## Adapters

| Adapter       | Base                 | Tools | Auth    |
| ------------- | -------------------- | ----- | ------- |
| **Iopole**    | BaseAdapter (direct) | 39/39 | OAuth2  |
| **Storecove** | BaseAdapter (direct) | 19/39 | API key |
| **Super PDP** | AfnorBaseAdapter     | 20/39 | OAuth2  |

- Adding a French PA with AFNOR: extend `AfnorBaseAdapter`, override with native
  API
- Adding a French PA without AFNOR: extend `BaseAdapter`, override all methods
  (like Iopole)
- Adding a non-French platform: extend `BaseAdapter` directly (like Storecove)
- Each adapter normalizes its native responses to typed return types
  (InvoiceDetail, SearchInvoicesResult, etc.)
- Iopole-specific logic (Lucene wrapping, status enrichment N+1, invoice
  normalization) lives in IopoleAdapter, NOT in tools

## Iopole API

- **Local API specs**: `packages/core/src/adapters/iopole/api-specs/` — 6
  OpenAPI JSON specs
- Sandbox API: api.ppd.iopole.fr/v1, Auth: auth.ppd.iopole.fr (default, NOT
  auth.iopole.com)
- Factur-X generate returns binary PDF — use `postBinary()` in IopoleClient
- Status enrichment: IopoleAdapter.searchInvoices does N+1 getStatusHistory
  (capped at 5 concurrent)
- IopoleAdapter.getInvoice does parallel fetch (invoice + statusHistory)
- `normalizeForIopole()` auto-fills: postalAddress, electronicAddress 0225,
  payableAmount (from invoiceAmount), lines[].taxDetail.categoryCode ("S"
  default)

## Super PDP API

- **Local API specs**: `packages/core/src/adapters/superpdp/api-specs/` —
  `superpdp.json` (v1.13.0.beta), `afnor-flow.json` (v1.2.0)
- Sandbox API: api.superpdp.tech/v1.beta, Auth: api.superpdp.tech/oauth2/token
- Invoice data lives in nested `en_invoice.*` (EN16931 model) — NOT flat fields
- Status comes from `events[last].status_code` — NOT a top-level `status` field
- Direction values: `"in"/"out"` (not "incoming"/"outgoing")
- Use `expand[]=en_invoice&expand[]=events` on GET /invoices to get nested data
- `sendStatus` body:
  `{ invoice_id: integer, status_code, details?: [{ reason?, amounts? }] }`
- Directory entries: `{ directory: "ppf"|"peppol", identifier: "scheme:value" }`
- `mapNetworkToDirectory()` maps `DOMESTIC_FR→ppf`,
  `PEPPOL_INTERNATIONAL→peppol`
- `normalizeForSuperPDP()` in `normalize.ts` — maps intuitive field names to
  EN16931 (same pattern as `normalizeForIopole()`)
- EN16931 quirks: `credit_transfers` (plural), `delivery_date` (not
  actual_delivery_date), `total_vat_amount` is `{ value, currency_code }` (not
  string)
- IBAN: `payment_account_identifier.scheme` must be `""` (empty string) — any
  other value breaks CII conversion
- FR mandatory: BR-FR-05 requires 3 notes (PMT/PMD/AAB), BR-FR-12 requires buyer
  `electronic_address` (French buyers only)
- SuperPDP uses cursor-based pagination (starting_after_id), not offset-based

## REST API

- `deno task rest:serve` — Hono REST API on port 3016
- Swagger UI available at `/docs`
- API key auth via `EINVOICE_REST_API_KEY` env var
- `--no-auth` flag for dev (skips auth middleware)
- Consumes `@casys/einvoice-core` adapters — same adapter layer as MCP
- Routes mirror MCP tools: invoice, config, entity, identifier, directory, status,
  reporting, webhook

## Status Codes (CDAR)

- Viewers use CDAR codes (PPF lifecycle, XP Z12-012)
- `getStatus()` in `packages/mcp/src/ui/shared/status.ts` resolves any format:
  CDAR numeric ("205"), prefixed ("fr:205"), Iopole ("APPROVED"), AFNOR ("Ok")
- 4 obligatoires PPF: 200 (Déposée), 210 (Refusée), 212 (Encaissée), 213
  (Rejetée)
- Lifecycle transition guards: `canAcceptReject()`, `canSendPayment()`,
  `canReceivePayment()`

## Viewers (MCP Apps)

- 6 React single-file HTML bundles in `packages/mcp/src/ui/dist/`
- After editing any TSX: must run `node build-all.mjs` AND rebuild dist
- New viewers auto-discovered by build BUT must be registered in
  `packages/mcp/server.ts` registerViewers()
- callServerTool = actions + drill-down, sendMessage = navigation (new
  conversation turn)
- Status badges: use `getStatus(code)` from shared/status.ts — never hardcode
  colors
- Doclist inline drill-down: implicit click (no chevron), expandable panel,
  auto-detects invoice vs generic data
- Doclist local expand: `_detail` in row data → inline expand without tool call
  (used by directory search)
- `_rowAction` = remote expand (calls tool), `_detail` = local expand (data
  already in row)
- CSS `border-radius` on iframe: `border-radius` on `html`, `overflow: hidden`
  on `#app` — NOT on `html` (kills vertical scroll on mobile WebView)
- Direction cell: SVG arrows (↓ blue received, ↑ orange sent)
- Status filter chips filtered by active direction (RECEIVED_STATUSES,
  SENT_STATUSES)

## Code Patterns

- Tools are PA-agnostic — they consume typed returns (InvoiceDetail,
  SearchInvoicesResult, etc.)
- Tool handlers return `{ content, structuredContent }` — content for LLM
  summary, structuredContent for viewer data
- `_title` for doclist heading, `_rowAction` for drill-down, `_detail` for local
  expand
- `mapToViewerPreview(inv)` is PA-agnostic — handles nested (Iopole-style),
  flat, or camelCase input
- `Number(amount).toLocaleString("fr-FR")` — coerce to number before locale
  formatting
- ActionButton `confirm` prop = double-click pattern for destructive actions
- `encodePathSegment()` on all URL path interpolations (security)
- `einvoiceErrorMapper` in framework toolErrorMapper (not local
  withErrorHandler)

## Testing

- Unit + E2E tests across all packages
- E2E tests per adapter: `e2e_test.ts` (Iopole), `e2e_superpdp_test.ts`
  (SuperPDP) — both need .env credentials
- Unit tests: all tools (invoice, directory, status, reporting, webhook,
  config), all adapters, AFNOR client/base-adapter
- `.env` at project root (gitignored) loads credentials for E2E — same vars as
  Claude Desktop config
- MCP Inspector: `deno task mcp:serve` + inspector on http://localhost:6274,
  connect Streamable HTTP to localhost:3015/mcp (Direct, not Via Proxy)
- generated-store: 10min TTL, in-memory only, lost on restart
- Mock adapter in `packages/core/src/testing/helpers.ts` —
  use `createMockAdapter()` for adapter mocks
- `unwrapStructured()` for structuredContent in
  `packages/mcp/src/testing/helpers.ts`
