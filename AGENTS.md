# Repository Guidelines

- Monorepo: 3 packages — `@casys/einvoice-core`, `@casys/mcp-einvoice`,
  `@casys/einvoice-rest` (JSR + npm).
- In chat replies, file references must be repo-root relative only (example:
  `packages/core/src/adapters/iopole/adapter.ts:42`); never absolute paths or
  `~/...`.
- Do not edit files that another adapter owns unless the change is explicitly
  cross-cutting. Treat each `packages/core/src/adapters/<name>/` as a separate
  surface.
- Language: TypeScript (Deno). Prefer strict typing; avoid `any`. All source
  uses `.ts` extensions in imports (Deno convention).

## Project Overview

PA-agnostic MCP server for e-invoicing via the adapter pattern. Multiple
adapters (Iopole, Storecove, Super PDP), tools across 6 categories, React
viewers (MCP Apps). Deno runtime + Node.js bundle for npm.

## Monorepo Structure

```
packages/
├── core/           # @casys/einvoice-core — adapter layer, types, shared utils
│   ├── mod.ts      # Public JSR API surface
│   └── src/
│       ├── adapter.ts          # EInvoiceAdapter interface + types
│       ├── adapters/           # BaseAdapter, AfnorBaseAdapter, Iopole, Storecove, SuperPDP
│       │   └── shared/         # BaseHttpClient, errors, oauth2, encoding, env
│       └── testing/helpers.ts  # createMockAdapter(), mockFetch()
├── mcp/            # @casys/mcp-einvoice — MCP server, tools, viewers
│   ├── server.ts
│   ├── mod.ts
│   └── src/
│       ├── client.ts           # Tools registry + capability filtering
│       ├── tools/              # 39 tools (6 categories)
│       ├── ui/                 # 6 viewers React (single-file HTML)
│       └── testing/helpers.ts  # unwrapStructured() + re-exports core helpers
└── rest/           # @casys/einvoice-rest — Hono REST API
    ├── server.ts
    └── src/
        └── routes/             # Hono routes (invoice, config, entity, etc.)
```

Inter-package dependencies:
- `packages/mcp` depends on `@casys/einvoice-core` (via JSR import)
- `packages/rest` depends on `@casys/einvoice-core` (via JSR import)
- `packages/mcp` and `packages/rest` do NOT depend on each other

## Import Boundaries

- Dependency graph within `packages/core`:
  `adapter.ts` ← `adapters/*` ← `adapters/shared/*`
- Dependency graph within `packages/mcp`:
  `tools/*` ← `client.ts` ← `server.ts`
- Tools must NEVER import adapter internals (client, normalize, api-specs). They
  consume only the typed returns from `EInvoiceAdapter` methods.
- Adapters must NOT import from `tools/` or `client.ts`.
- Cross-adapter code goes in `packages/core/src/adapters/shared/`. Do not import
  one adapter from another.
- UI viewers import shared code via `~/shared/*` path alias (Vite-resolved). Do
  not import from `src/` proper.
- Deno runtime server has a single external dependency: `@casys/mcp-server` (via
  import map in `deno.json`). UI has its own `package.json` with React, Vite,
  etc. Do not add server dependencies without explicit approval.
- `mod.ts` in each package is the public JSR API surface — only re-export what
  library consumers need.

## Build, Test & Development Commands

All commands run from **workspace root** (not from a package directory).

| Command | Purpose |
| --- | --- |
| `deno task mcp:serve` | MCP HTTP mode on port 3015 (localhost) |
| `deno task rest:serve` | REST API on port 3016 |
| `deno task test` | Run all tests across all packages |
| `deno task test:core` | Run tests for einvoice-core only |
| `deno task test:mcp` | Run tests for mcp-einvoice only |
| `deno task test:rest` | Run tests for einvoice-rest only |
| `deno task inspect` | Launch MCP Inspector |
| `cd packages/mcp/src/ui && node build-all.mjs` | Rebuild all viewers |

- After editing any TSX file: rebuild viewers before testing.
- `deno task inspect` launches the MCP Inspector AND spawns the server — no need
  to run `deno task mcp:serve` separately. Connect Streamable HTTP to
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
- Version is managed in `deno.json` `version` field in each package
  (`packages/core/deno.json`, `packages/mcp/deno.json`, `packages/rest/deno.json`).
  Keep all three in sync. `scripts/build-node.sh` reads from
  `packages/mcp/deno.json`.
- Do not bump version unless explicitly asked — CI gracefully skips if version
  is already published.
- Commit messages: concise, action-oriented (e.g. `fix: wrap config response in
  structuredContent`). Group related changes; avoid bundling unrelated refactors.
- Never commit `.env`, credentials, or secrets. The `.env` file is gitignored.

## Architecture

### Adapter Hierarchy

```
EInvoiceAdapter (interface — see packages/core/src/adapter.ts)
└── BaseAdapter (abstract — all methods throw NotSupportedError)
    ├── IopoleAdapter    — all caps, OAuth2, extends BaseAdapter directly
    ├── StorecoveAdapter — partial caps, API key, extends BaseAdapter directly
    └── AfnorBaseAdapter (abstract — AFNOR XP Z12-013 socle)
        └── SuperPDPAdapter — partial caps, OAuth2
```

Check each adapter's `capabilities` Set for the current list of supported
methods. The `packages/mcp/src/tools/mod_test.ts` assertion is the source of
truth for total tool count.

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

After adding: register in BOTH `packages/core/src/adapters/registry.ts` AND the
`createAdapter()` switch in `packages/mcp/server.ts` (the logic is duplicated),
add env vars to `.env.example`, add factory function in the adapter module.

### HTTP Clients

All 4 HTTP clients (Iopole, Storecove, SuperPDP, AFNOR) extend `BaseHttpClient`
in `packages/core/src/adapters/shared/http-client.ts`.

- `BaseHttpClient` (abstract) — provides `request()`, `get()`, `post()`,
  `put()`, `patch()`, `delete()`, `download()`. Subclasses implement
  `getAuthHeaders()` for authentication.
- `requestWithBase(baseUrl, method, path, options)` — `protected` method that
  `request()` delegates to. Subclasses call it directly when they need a
  different base URL (e.g. IopoleClient.getV11 uses a v1.1 URL). Concurrent-safe
  — no state mutation.
- All clients use `AbortController` + `setTimeout` (30s default). `clearTimeout`
  always in `finally`. Only `IopoleClient.postBinary()` uses 60s for PDF
  generation — all other operations including binary downloads use 30s.
- Iopole-specific methods that bypass `request()` because they need non-JSON
  responses or multipart uploads: `postBinary()` (binary PDF), `upload()`
  (FormData), `postWithQuery()` (POST with query params). These still use
  `getAuthHeaders()` and `AdapterAPIError` for consistency.

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
  `body`. Adapter name baked into `.name` (e.g. `error.name === "IopoleAPIError"`).
- `einvoiceErrorMapper` (registered as `toolErrorMapper` on
  `ConcurrentMCPServer`): maps errors to MCP `isError: true` responses.
  Framework-level, not per-tool — do NOT add local try/catch in tool handlers
  unless you need to transform the error before it reaches the mapper.
- All `Error` instances are mapped (validation, API, or generic). Only
  non-`Error` unknowns return `null` (framework rethrows as JSON-RPC error).

## Iopole API

- **Local API specs**: `packages/core/src/adapters/iopole/api-specs/` — OpenAPI
  JSON specs.
- Sandbox: `api.ppd.iopole.fr/v1`, Auth: `auth.ppd.iopole.fr` (default — NOT
  `auth.iopole.com`).
- Factur-X generate returns binary PDF — use `postBinary()` in IopoleClient.
- Status enrichment: `searchInvoices` does N+1 `getStatusHistory` (capped at 5
  concurrent).
- `getInvoice`: parallel fetch (invoice + statusHistory via `Promise.all`).
- `normalizeForIopole()` auto-fills: `postalAddress`, `electronicAddress 0225`,
  `payableAmount` (from `invoiceAmount`), `lines[].taxDetail.categoryCode`
  (`"S"` default).
- `autoWrapDirectoryQuery()`: Lucene wrapping for SIRET (14 digits), SIREN (9),
  FR VAT, wildcard name.

## Super PDP API

- **Local API specs**: `packages/core/src/adapters/superpdp/api-specs/`.
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
- `getStatus()` in `packages/mcp/src/ui/shared/status.ts` resolves any format:
  CDAR numeric (`"205"`), prefixed (`"fr:205"`), Iopole label (`"APPROVED"`),
  AFNOR (`"Ok"`). Never hardcode status colors — always use `getStatus()`.
- 4 obligatoires PPF: 200 (Déposée), 210 (Refusée), 212 (Encaissée), 213
  (Rejetée).
- Lifecycle transition guards: `canAcceptReject()`, `canSendPayment()`,
  `canReceivePayment()`.

## Viewers (MCP Apps)

React single-file HTML bundles in `packages/mcp/src/ui/dist/`, built via
`vite-plugin-singlefile`. Each viewer has a `contract.md` describing its data
contract — read it before modifying.

### Viewer Development Rules

- After editing any TSX: run `cd packages/mcp/src/ui && node build-all.mjs` to
  rebuild dist. New viewers are auto-discovered by the build BUT must also be
  registered in `packages/mcp/server.ts` `registerViewers()`.
- `callServerTool` = actions + drill-down. `sendMessage` = navigation (new
  conversation turn).
- `ActionButton` `confirm` prop = double-click pattern for destructive actions.
- Direction cell: SVG arrows (↓ blue received, ↑ orange sent).
- Status filter chips are filtered by active direction
  (`RECEIVED_STATUSES` / `SENT_STATUSES`).
- Doclist implicit click (no chevron), expandable panel, auto-detects invoice vs
  generic data.
- CSS `border-radius` on iframe: `border-radius` on `html`, `overflow: hidden`
  on `#app` — NOT on `html` (kills vertical scroll on mobile WebView).
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

### Architecture Discipline

- **Utilise l'abstraction dont tu hérites.** Si tu extends une classe, utilise
  ses méthodes. Si tu te retrouves à réécrire la même logique (auth, timeout,
  erreurs, parsing) dans une sous-classe — c'est que tu bypasses l'abstraction
  au lieu de l'étendre. Ajoute une méthode protégée à la base si elle manque.
- **>10 lignes dupliquées = problème de design.** Pas un problème
  d'implémentation. Refactorise avant de commit, pas après.
- **Pas de mutation temporaire d'état partagé.** Ne change jamais un champ
  d'instance pour un seul appel puis restore en `finally`. C'est une race
  condition dès qu'il y a de la concurrence (`Promise.all`). Passe la valeur
  en paramètre.
- **Chaque méthode publique ajoutée ou modifiée a un test.** Le test fait
  partie du changement, pas d'une passe ultérieure.
- **Pas de suppression silencieuse d'assertions.** Si un test vérifiait un
  comportement et que tu retires l'assertion, justifie dans le commit message.
  Si le comportement a changé, le test change — il ne disparaît pas.
- **Self-review avant de commit.** Relis le diff. Cherche la duplication, les
  chemins non testés, les régressions de comportement. Ce que la review
  trouve, tu aurais dû le trouver avant.

### AX (Agent Experience) — Design for Agent Consumption

Ce serveur MCP est consommé par des agents IA. Appliquer ces principes :

- **Fast Fail Early.** Rejeter les inputs invalides avant les opérations
  coûteuses. Valider à la frontière, pas au fond du call stack.
- **Outputs déterministes.** Mêmes inputs → mêmes outputs. Pas de dépendance
  à `Date.now()` ou `Math.random()` dans les chemins déterministes. Isoler et
  rendre injectable quand nécessaire (UUIDs, timestamps).
- **Erreurs machine-readable.** Erreurs structurées avec codes, pas juste des
  messages string. Les agents parsent des codes, pas de la prose. Préfixes
  standards : `INVALID_*`, `MISSING_*`, `ORPHAN_*`, `CONFLICT_*`,
  `UNSUPPORTED_*`.
- **Explicit over implicit.** Pas de defaults magiques qui changent le
  comportement silencieusement. Chaque configuration a un default visible.
- **Primitives composables.** Chaque fonction fait une chose. Les étapes du
  pipeline sont indépendantes et recombinables. Les agents peuvent utiliser
  chaque étape séparément.
- **Contrats étroits.** Inputs minimaux requis, type safety maximale.
  Accepter uniquement ce qui est nécessaire. Éviter les God objects.
- **Documentation colocalisée.** Les docs vivent à côté du code. Chaque
  module a son propre contrat (`contract.md` pour les viewers). Les agents
  trouvent les docs en explorant l'arbre de fichiers.
- **Tests-first invariants.** Chaque comportement a un test. Les tests sont
  la spécification exécutable. Prioriser les tests de bordure sur le
  happy-path.

### What NOT to Do

- Do not add local try/catch in tool handlers — use `einvoiceErrorMapper`.
- Do not import adapter-specific code from tools.
- Do not hardcode status colors — use `getStatus()`.
- Do not add server-side dependencies without approval.
- Do not set `Content-Type` on multipart uploads.
- Do not use offset-based pagination with SuperPDP (it's cursor-based).
- Do not put PA-specific logic in tools (Lucene wrapping, N+1 enrichment,
  normalization all belong in the adapter).
- Do not use `Deno.*` APIs outside `packages/mcp/src/runtime.ts` — always go
  through the runtime abstraction. If you need a new platform API, add it to
  both `runtime.ts` and `runtime.node.ts`.

## Testing

- Run: `deno task test` (all tests, unit + E2E, across all packages).
- Tests colocated as `*_test.ts` next to source files.
- E2E: `packages/mcp/src/e2e_test.ts` (Iopole),
  `packages/mcp/src/e2e_superpdp_test.ts` (SuperPDP) — both need `.env`
  credentials, skip gracefully without them.
- Core test helpers: `packages/core/src/testing/helpers.ts` —
  `createMockAdapter()`, `mockFetch()`.
- MCP test helpers: `packages/mcp/src/testing/helpers.ts` —
  `unwrapStructured()` + re-exports core helpers.
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

- **JSR**: `@casys/einvoice-core`, `@casys/mcp-einvoice`, `@casys/einvoice-rest`
  — published directly from source.
- **npm**: `@casys/mcp-einvoice` — published from `dist-node/bin/` (esbuild
  bundle). Binary: `mcp-einvoice`. `@casys/einvoice-core` also published to npm.
- CI handles both. Version bump in each `packages/*/deno.json` (keep in sync).
  Do not manually publish unless CI is broken.
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
