# CLAUDE.md — mcp-einvoice

## Project

MCP server for e-invoicing — PA-agnostic via the adapter pattern. 3 adapters
(Iopole, Storecove, Super PDP), 39 tools, 6 viewers, BaseAdapter +
AfnorBaseAdapter hierarchy. Deno + TypeScript + React viewers. v0.1.2.

## Commands

- `deno task serve` — HTTP mode on port 3015 (localhost by default)
- `deno task test` — run tests (369 tests, all must pass)
- `deno task inspect` — launch MCP Inspector
- `cd src/ui && node build-all.mjs` — rebuild all viewers (required after TSX
  changes)
- Run from project root, not src/ui/ (server.ts won't be found otherwise)

## Git

- Use plain `git` for all operations (GitButler removed)
- Small fixes: `git commit` + `git push origin main`
- Features: branch + `gh pr create` + `gh pr merge`
- CI auto-publishes to JSR + npm on push to main
- Version bump only in `deno.json`

## Architecture

- `EInvoiceAdapter` interface (45 methods, 8 typed returns) in `src/adapter.ts`
- `BaseAdapter` (abstract) in `src/adapters/base-adapter.ts` — NotSupportedError
  stubs for all 45 methods
- `AfnorBaseAdapter` extends BaseAdapter in `src/adapters/afnor/` — AFNOR XP
  Z12-013 socle for French PAs with AFNOR
- `AdapterMethodName` type ensures compile-time safety for capabilities
- `BaseHttpClient` in `src/adapters/shared/http-client.ts` — shared HTTP logic,
  subclasses provide auth
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

- **Local API specs**: `src/adapters/iopole/api-specs/` — 6 OpenAPI JSON specs
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

- **Local API specs**: `src/adapters/superpdp/api-specs/` — `superpdp.json`
  (v1.13.0.beta), `afnor-flow.json` (v1.2.0)
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

## Status Codes (CDAR)

- Viewers use CDAR codes (PPF lifecycle, XP Z12-012)
- `getStatus()` in `src/ui/shared/status.ts` resolves any format: CDAR numeric
  ("205"), prefixed ("fr:205"), Iopole ("APPROVED"), AFNOR ("Ok")
- 4 obligatoires PPF: 200 (Déposée), 210 (Refusée), 212 (Encaissée), 213
  (Rejetée)
- Lifecycle transition guards: `canAcceptReject()`, `canSendPayment()`,
  `canReceivePayment()`

## Viewers (MCP Apps)

- 6 React single-file HTML bundles in src/ui/dist/
- After editing any TSX: must run `node build-all.mjs` AND rebuild dist
- New viewers auto-discovered by build BUT must be registered in server.ts
  registerViewers()
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

- 369 tests total (unit + E2E)
- E2E tests per adapter: `e2e_test.ts` (Iopole), `e2e_superpdp_test.ts`
  (SuperPDP) — both need .env credentials
- Unit tests: all tools (invoice, directory, status, reporting, webhook,
  config), all adapters, AFNOR client/base-adapter
- `.env` at project root (gitignored) loads credentials for E2E — same vars as
  Claude Desktop config
- MCP Inspector: `deno task serve` + inspector on http://localhost:6274, connect
  Streamable HTTP to localhost:3015/mcp (Direct, not Via Proxy)
- generated-store: 10min TTL, in-memory only, lost on restart
- Mock adapter in `src/testing/helpers.ts` — use `createMockAdapter()` and
  `unwrapStructured()` for structuredContent
