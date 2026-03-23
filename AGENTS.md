# Repository Guidelines

- Package: `@casys/mcp-einvoice` (JSR + npm).
- In chat replies, file references must be repo-root relative only (example:
  `src/adapters/iopole/adapter.ts:42`); never absolute paths or `~/...`.
- Do not edit files that another adapter owns unless the change is explicitly
  cross-cutting. Treat each `src/adapters/<name>/` as a separate surface.
- Language: TypeScript (Deno). Prefer strict typing; avoid `any`. All source
  uses `.ts` extensions in imports (Deno convention).

## Project Overview

PA-agnostic MCP server for e-invoicing via the adapter pattern. Multiple
adapters (Iopole, Storecove, Super PDP), tools across 6 categories, React
viewers (MCP Apps). Deno runtime + Node.js bundle for npm.

## Import Boundaries

- Dependency graph is strictly layered:
  `adapter.ts` ← `adapters/*` ← `tools/*` ← `client.ts` ← `server.ts`
- Tools must NEVER import adapter internals (client, normalize, api-specs). They
  consume only the typed returns from `EInvoiceAdapter` methods.
- Adapters must NOT import from `tools/` or `client.ts`.
- Cross-adapter code goes in `adapters/shared/`. Do not import one adapter from
  another.
- UI viewers import shared code via `~/shared/*` path alias (Vite-resolved). Do
  not import from `src/` proper.
- Deno runtime server has a single external dependency: `@casys/mcp-server` (via
  import map in `deno.json`). UI has its own `package.json` with React, Vite,
  etc. Do not add server dependencies without explicit approval.
- `mod.ts` is the public JSR API surface — only re-export what library consumers
  need.

## Build, Test & Development Commands

| Command | Purpose |
| --- | --- |
| `deno task serve` | HTTP mode on port 3015 (localhost) |
| `deno task test` | Run all tests (unit + E2E) |
| `deno task inspect` | Launch MCP Inspector (spawns server internally) |
| `deno task compile` | Compile to standalone binary |
| `deno task build:node` | Build Node.js bundle (esbuild → `dist-node/`) |
| `deno task ui:build` | Rebuild all viewers |

- **Always run from project root** — `server.ts` resolution depends on it.
- After editing any TSX file: rebuild viewers before testing (`deno task
  ui:build`).
- `deno task inspect` launches the MCP Inspector AND spawns the server — no need
  to run `deno task serve` separately. Connect Streamable HTTP to
  `localhost:3015/mcp` (Direct mode, NOT Via Proxy).
- E2E tests require `.env` at project root with real credentials — they skip
  gracefully without them.

### Server CLI Flags

| Flag | Purpose |
| --- | --- |
| `--http` | Enable HTTP mode (default: stdio) |
| `--port=N` | HTTP port (default: 3015) |
| `--hostname=H` | Bind hostname (default: localhost) |
| `--adapter=name` | Override adapter (default: env `EINVOICE_ADAPTER`) |
| `--categories=csv` | Filter tool categories (e.g. `invoice,status`) |

## Git & CI/CD

- Use plain `git` for all operations (no GitButler, no custom tooling).
- Small fixes: commit + `git push origin main` directly.
- Features: branch + `gh pr create` + `gh pr merge`.
- CI auto-publishes to JSR + npm on every push to `main`
  (`.github/workflows/publish.yml`). CI builds UI viewers before publishing.
- Version is managed **only** in `deno.json` `version` field.
  `scripts/build-node.sh` reads it from there.
- Do not bump version unless explicitly asked — CI gracefully skips if version
  is already published.
- Commit messages: concise, action-oriented (e.g. `fix: wrap config response in
  structuredContent`). Group related changes; avoid bundling unrelated refactors.
- Never commit `.env`, credentials, or secrets. The `.env` file is gitignored.

## Architecture

### Adapter Hierarchy

```
EInvoiceAdapter (interface — see src/adapter.ts for current method count)
└── BaseAdapter (abstract — all methods throw NotSupportedError)
    ├── IopoleAdapter    — all caps, OAuth2, extends BaseAdapter directly
    ├── StorecoveAdapter — partial caps, API key, extends BaseAdapter directly
    └── AfnorBaseAdapter (abstract — AFNOR XP Z12-013 socle)
        └── SuperPDPAdapter — partial caps, OAuth2
```

Check each adapter's `capabilities` Set for the current list of supported
methods. The `src/tools/mod_test.ts` assertion is the source of truth for total
tool count.

- `AdapterMethodName` type = `Exclude<keyof EInvoiceAdapter, "name" |
  "capabilities">` — compile-time safety for capabilities and tool `requires`.
- Tools declare `requires: ["methodName"]` — only exposed when the active
  adapter supports all listed methods.
- Each adapter normalizes native API responses to shared typed returns
  (`InvoiceDetail`, `SearchInvoicesResult`, etc.). PA-specific logic stays in
  the adapter, NOT in tools.

### Adding a New Adapter

| Scenario | Base class | Notes |
| --- | --- | --- |
| French PA with AFNOR | `AfnorBaseAdapter` | Override with native API calls |
| French PA without AFNOR | `BaseAdapter` | Override all needed methods (like Iopole) |
| Non-French platform | `BaseAdapter` | Override all needed methods (like Storecove) |

After adding: register in BOTH `src/adapters/registry.ts` AND the
`createAdapter()` switch in `server.ts` (the logic is duplicated), add env vars
to `.env.example`, add factory function in the adapter module.

### HTTP Clients

- `BaseHttpClient` (abstract) in `shared/http-client.ts` — shared HTTP logic
  with `get`, `post`, `put`, `patch`, `delete`. Subclasses provide auth headers.
- All clients use `AbortController` + `setTimeout` (30s default). `clearTimeout`
  always in `finally`. Only `IopoleClient.postBinary()` uses 60s for PDF
  generation — all other operations including binary downloads use 30s.

### Tool System

Tools are PA-agnostic. They call adapter methods and return structured data.

- `content`: text summary for LLM consumption
- `structuredContent`: JSON data for viewer rendering
- `_title`: heading for doclist-viewer
- `_rowAction: { toolName, idField, argName }`: remote drill-down (calls tool)
- `_detail`: local drill-down data (expanded inline, no tool call)
- `refreshRequest: { toolName, arguments }`: optional payload that tells the
  viewer to auto-refresh (used by invoice-viewer for non-terminal statuses)
- All `_`-prefixed fields are hidden from doclist columns

### Generate → Preview → Submit Workflow

Invoice generation tools (`generateCII`, `generateUBL`, `generateFacturX`)
store generated data in the `generated-store` (10min TTL, in-memory) and return
a `generated_id`. The submit tool accepts this `generated_id` to retrieve and
send the invoice. This decouples generation from submission, allowing the user
to preview before sending.

### Error Handling

- `NotSupportedError`: thrown by `BaseAdapter.notSupported()` — adapter doesn't
  support the method.
- `AdapterAPIError`: thrown by all HTTP clients on non-2xx. Carries `status` and
  `body`. Adapter name baked into `.name` (e.g. `IopoleAPIError`).
- `einvoiceErrorMapper` (registered as `toolErrorMapper` on
  `ConcurrentMCPServer`): maps errors to MCP `isError: true` responses.
  Framework-level, not per-tool — do NOT add local try/catch in tool handlers
  unless you need to transform the error before it reaches the mapper.
- All `Error` instances are mapped (validation, API, or generic). Only
  non-`Error` unknowns return `null` (framework rethrows as JSON-RPC error).

## Iopole API

- **Local API specs**: `src/adapters/iopole/api-specs/` — OpenAPI JSON specs.
- Sandbox: `api.ppd.iopole.fr/v1`, Auth: `auth.ppd.iopole.fr` (default — NOT
  `auth.iopole.com`).
- Factur-X generate returns binary PDF — use `postBinary()` in IopoleClient.
- Status enrichment: `searchInvoices` does N+1 `getStatusHistory` (capped at 5
  concurrent).
- `getInvoice`: parallel fetch (invoice + statusHistory).
- `normalizeForIopole()` auto-fills: `postalAddress`, `electronicAddress 0225`,
  `payableAmount` (from `invoiceAmount`), `lines[].taxDetail.categoryCode`
  (`"S"` default).
- `autoWrapDirectoryQuery()`: Lucene wrapping for SIRET (14 digits), SIREN (9),
  FR VAT, wildcard name.

## Super PDP API

- **Local API specs**: `src/adapters/superpdp/api-specs/`.
- Sandbox: `api.superpdp.tech/v1.beta`, Auth:
  `api.superpdp.tech/oauth2/token`.
- Invoice data lives in nested `en_invoice.*` (EN16931 model) — NOT flat fields.
- Status: `events[last].status_code` — NOT a top-level `status` field.
- Direction values: `"in"/"out"` (not `"incoming"/"outgoing"`).
- Use `expand[]=en_invoice&expand[]=events` on GET /invoices.
- `sendStatus` body:
  `{ invoice_id: integer, status_code, details?: [{ reason?, amounts? }] }`.
- Directory: `{ directory: "ppf"|"peppol", identifier: "scheme:value" }`.
  `mapNetworkToDirectory()` maps `DOMESTIC_FR→ppf`,
  `PEPPOL_INTERNATIONAL→peppol`.
- `normalizeForSuperPDP()` in `normalize.ts` — maps intuitive field names to
  EN16931.
- EN16931 quirks: `credit_transfers` (plural), `delivery_date` (not
  `actual_delivery_date`), `total_vat_amount` is `{ value, currency_code }`.
- IBAN: `payment_account_identifier.scheme` must be `""` (empty string).
- FR mandatory: BR-FR-05 requires 3 notes (PMT/PMD/AAB), BR-FR-12 requires
  buyer `electronic_address` (French buyers only).
- Cursor-based pagination (`starting_after_id`), not offset-based.

## Status Codes (CDAR)

- Viewers use CDAR codes (PPF lifecycle, XP Z12-012).
- `getStatus()` in `src/ui/shared/status.ts` resolves any format: CDAR numeric
  (`"205"`), prefixed (`"fr:205"`), Iopole label (`"APPROVED"`), AFNOR
  (`"Ok"`). Never hardcode status colors — always use `getStatus()`.
- 4 obligatoires PPF: 200 (Déposée), 210 (Refusée), 212 (Encaissée), 213
  (Rejetée).
- Lifecycle transition guards: `canAcceptReject()`, `canSendPayment()`,
  `canReceivePayment()`.

## Viewers (MCP Apps)

React single-file HTML bundles in `src/ui/dist/`, built via
`vite-plugin-singlefile`. Each viewer has a `contract.md` describing its data
contract — read it before modifying.

### Viewer Development Rules

- After editing any TSX: run `deno task ui:build` to rebuild dist. New viewers
  are auto-discovered by the build BUT must also be registered in `server.ts`
  `registerViewers()`.
- `callServerTool` = actions + drill-down. `sendMessage` = navigation (new
  conversation turn).
- `ActionButton` `confirm` prop = double-click pattern for destructive actions.
- Direction cell: SVG arrows (↓ blue received, ↑ orange sent).
- Status filter chips are filtered by active direction
  (`RECEIVED_STATUSES` / `SENT_STATUSES`).
- Doclist implicit click (no chevron), expandable panel, auto-detects invoice vs
  generic data.
- CSS `border-radius` on iframe: apply `overflow: hidden` to `html` only — NOT
  `body` (kills scroll).
- UI uses `@modelcontextprotocol/ext-apps` (`App` class).
- Refresh behavior varies by viewer: `invoice-viewer` has a 15s auto-refresh
  interval; `doclist-viewer`, `status-timeline`, `directory-list`, and
  `directory-card` refresh on focus/visibility change only (no polling timer).
  All refresh is gated by `canRequestUiRefresh()` from `shared/refresh.ts`.

## Coding Style & Patterns

- **Tools are PA-agnostic**: they consume typed returns, never adapter
  internals.
- Tool handlers return `{ content, structuredContent }` — `content` for LLM,
  `structuredContent` for viewers.
- `mapToViewerPreview(inv)` is PA-agnostic — handles nested (Iopole-style),
  flat, or camelCase input.
- `Number(amount).toLocaleString("fr-FR")` — always coerce to number before
  locale formatting.
- `encodePathSegment()` on ALL URL path interpolations — mandatory for
  security. Never interpolate user input into URL paths without encoding.
- Naming: tools use `einvoice_` prefix + `snake_case`. Adapters use
  `PascalCase` class names.
- Keep files concise. Extract helpers instead of duplicating code.
- Add brief code comments only for tricky or non-obvious logic. Do not add
  docstrings to code you didn't change.

### Security Guardrails

- `encodePathSegment(s)` on every URL path interpolation (prevents path
  injection).
- `uint8ToBase64(data)` chunks at 8192 bytes (prevents stack overflow on large
  files).
- OAuth2 tokens cached in closure (not exposed), auto-refresh 60s before
  expiry, deduplicates concurrent requests, 15s timeout on token endpoint.
- Secrets enter only via `requireEnv()` — never logged, never in responses.
- `Content-Type` for multipart uploads: let `fetch` set the boundary
  automatically — do NOT set it manually.
- Binary responses (PDFs): read as `arrayBuffer()` directly — never coerce
  through text encoding.

### What NOT to Do

- Do not add local try/catch in tool handlers — use `einvoiceErrorMapper`.
- Do not import adapter-specific code from tools.
- Do not hardcode status colors — use `getStatus()`.
- Do not add server-side dependencies without approval.
- Do not set `Content-Type` on multipart uploads.
- Do not use offset-based pagination with SuperPDP (it's cursor-based).
- Do not put PA-specific logic in tools (Lucene wrapping, N+1 enrichment,
  normalization all belong in the adapter).
- Do not use `Deno.*` APIs outside `src/runtime.ts` — always go through the
  runtime abstraction. If you need a new platform API, add it to both
  `runtime.ts` and `runtime.node.ts`.

## Testing

- Run: `deno task test` (all tests, unit + E2E).
- Tests colocated as `*_test.ts` next to source files.
- E2E: `src/e2e_test.ts` (Iopole), `src/e2e_superpdp_test.ts` (SuperPDP) —
  both need `.env` credentials, skip gracefully without them.
- Use `createMockAdapter()` and `unwrapStructured()` from
  `src/testing/helpers.ts` for unit tests.
- Use `mockFetch(responses)` to mock HTTP calls in adapter tests.
- `generated-store`: 10min TTL, in-memory only, lost on restart.
- All tests must pass before pushing to `main`.

### Testing Guardrails

- Prefer narrowly scoped tests that directly validate the touched behavior.
- Mock the adapter for tool tests, mock `fetch` for adapter tests. Do not
  make real HTTP calls in unit tests.
- Test both `content` (LLM text) and `structuredContent` (viewer data) in tool
  tests.
- E2E tests validate real API behavior — they are the source of truth for
  adapter correctness.
- Do not modify test helpers or mock infrastructure to silence failures — fix
  the root cause.

## Environment Variables

See `.env.example` for the full list with descriptions. Key variables:

- `EINVOICE_ADAPTER`: adapter selection (`iopole` | `storecove` | `superpdp`,
  default: `iopole`)
- Each adapter requires its own set of credentials (API URL, auth credentials).
  Check `createXxxAdapter()` factory functions for required vs optional vars.

## Publishing

- **JSR**: `@casys/mcp-einvoice` — published directly from source.
- **npm**: `@casys/mcp-einvoice` — published from `dist-node/bin/` (esbuild
  bundle). Binary: `mcp-einvoice`.
- CI handles both. Version bump only in `deno.json`. Do not manually publish
  unless CI is broken.
- `scripts/build-node.sh` swaps `runtime.ts` → `runtime.node.ts`, strips `.ts`
  extensions, bundles via esbuild, copies UI dist.

## Collaboration & Safety Notes

- Never commit or publish real credentials, phone numbers, or live config
  values.
- Release guardrails: do not change version without explicit consent.
- When answering questions, verify in code first — do not guess.
- Keep changes scoped: a bug fix doesn't need surrounding code cleaned up.
- Do not add features, refactor code, or make "improvements" beyond what was
  asked.
