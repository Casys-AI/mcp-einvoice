# Changelog

## 0.3.0 (2026-04-05)

### Breaking changes

- **Iopole reporting endpoints replaced**: Iopole removed
  `/v1/reporting/fr/invoice/transaction` and
  `/v1/reporting/fr/transaction/{businessEntityId}`. New endpoints use
  `scheme/{identifierScheme}/value/{identifierValue}` pattern. Both
  `reportInvoiceTransaction` and `reportTransaction` adapter methods need
  migration. **Pending — see plan.**

### Refactoring

- **IopoleClient extends BaseHttpClient**: was the only standalone HTTP client
  (340 lines). Now all 4 clients extend BaseHttpClient. `requestWithBase()`
  added for concurrent-safe URL overrides (used by `getV11()`).
- **IopoleAPIError removed**: replaced by `AdapterAPIError("Iopole", ...)`
  everywhere. `error.name` is still `"IopoleAPIError"` via convention.
- **All 34 `Promise<unknown>` typed**: 4 new types (`FileEntry`,
  `WebhookDetail`, `SearchDirectoryIntResult`, `DirectoryIntRow`), 27 methods
  → `Promise<Record<string, unknown>>`, `getCustomerId` → `Promise<string>`.
  Zero `as any` in tool files.
- **Adapter normalization**: Iopole `getInvoiceFiles`, `getAttachments`,
  `listWebhooks`, `getWebhook`, `createWebhook`, `updateWebhook`,
  `searchDirectoryInt` — all normalize native API fields to typed interfaces.
  SuperPDP `getCustomerId` returns `String(company.id)`.

### Features

- **structuredContent on all 39 tools**: every tool returns
  `{ content, structuredContent }`. 19 mutation tools use `action-result`
  viewer, 4 list tools use `doclist-viewer`/`directory-list`, 4 detail/simple
  tools pass through raw data.
- **Workflow chaining**: `enroll_fr` suggests `network_register_by_id`,
  `status_send` suggests `status_history` via `nextAction`.
- **annotations**: `readOnlyHint` on all read tools, `destructiveHint` on all
  delete tools.

### Fixes

- **Viewer titles**: 4 HTML files + build script changed from `mcp-iopole` to
  `mcp-einvoice`.
- **CSS overflow claim**: AGENTS.md corrected (`overflow: hidden` on `#app`,
  not `html`).

### Documentation

- **CLAUDE.md → AGENTS.md**: single source of truth, CLAUDE.md is a pointer.
- **AGENTS.md updated for monorepo**: all paths, commands, publishing, version
  management corrected for 3-package structure.
- **Architecture Discipline section**: 6 rules (no duplication, no state
  mutation, tests required, no silent assertion removal, self-review).
- **AX (Agent Experience) section**: 8 rules for agent-consumable design.

### API specs

- **Iopole specs updated** (2026-04-05): invoicing (new `type`/`processType`
  descriptions, 1 new rejection reason), config (3 new onboarding stages,
  `vatRegime` on enrollment, new webhook callback fields), reporting (**breaking
  — new path scheme**), edi (unchanged).

### Tests

- 501 tests (was 441), 0 failures.
- New: `getV11` URL/immutability, `postBinary` success/error, `upload`
  FormData/error, `postWithQuery`, `atob` invalid, peppol not-found status.
- All 27 structuredContent tools have shape + viewer tests.
- Config assertions strengthened (exact `action`/`title` values, not `typeof`).

## 0.2.0 (2026-03-19)

### Breaking changes

- **Renamed `einvoice_invoice_emit` → `einvoice_invoice_submit`**: aligns with
  Iopole lifecycle — the user submits, the platform issues (ISSUED).
- **Removed 4 seen/unseen tools**: `einvoice_invoice_not_seen`,
  `einvoice_invoice_mark_seen`, `einvoice_status_not_seen`,
  `einvoice_status_mark_seen`. Iopole's seen/unseen mechanism is opaque and
  always empty in PUSH mode (active webhook).
- **Removed directory drill-down**: `einvoice_directory_fr_search` no longer
  drills down to `einvoice_config_entity_get` (public vs operator-scoped IDs
  mismatch).
- **39 tools** (was 43).

### New features

- **Doclist inline drill-down**: clicking a row in the doclist viewer expands an
  inline detail panel below the row with invoice data, action buttons
  (Accepter/Rejeter/Contester/Paiement), and a "Détails complets" navigation
  button. Chevron ▶ indicator rotates on expansion.
- **Status enrichment**: `einvoice_invoice_get` now fetches `getStatusHistory`
  in parallel via `Promise.all` to get the real status — Iopole's `getInvoice`
  has no `state` field.
- **INBOUND status fallback**: when drilling down on a received invoice (which
  has no status history), the status is copied from the doclist row data.
- **Auto-refresh after action**: after clicking an action button in the inline
  panel, the detail and list refresh automatically after 2.5s.
- **5 new config tools** (43 → 39 total after removing seen tools):
  `einvoice_config_identifier_create`,
  `einvoice_config_identifier_create_by_scheme`,
  `einvoice_config_identifier_delete`, `einvoice_config_entity_configure` (VAT
  regime), `einvoice_config_claim_delete`.
- **Entity create fix**: `create_legal` and `create_office` now use correct
  Iopole API fields (`identifierScheme`/`identifierValue` instead of bare
  `siren`/`siret`), and include `scope` (required, default: PRIMARY).
- **Direction + status filters on search**: `einvoice_invoice_search` now has
  `direction` (received/sent) and `status` (APPROVED, REFUSED, etc.) parameters.
  Server-side filtering since Iopole Lucene doesn't support these fields.
  Dynamic title ("Factures reçues (APPROVED)") and Direction column hidden when
  filtered.
- **Download PDF/XML from viewer**: buttons use `app.downloadFile()` SDK API for
  sandboxed iframe downloads. PDF falls back to XML source when readable PDF not
  available (404).
- **Filter chips**: auto-detected column filters (Direction, Statut) as toggle
  buttons above the doclist table.
- **Casys M3 Expressive design**: purple accent (light) / warm orange (dark),
  clean typography, no card boxes.
- **Shared modules**: `~/shared/status.ts` (unified registry),
  `~/shared/ActionButton.tsx`, `~/shared/InfoCard.tsx` — eliminated 150+ lines
  of duplication.
- **Iopole API specs imported**: 6 OpenAPI JSON specs in
  `src/adapters/api-specs/` for offline reference.

### Bug fixes

- **Empty doclist skeleton fix**: `consumeToolResult` guard now handles empty
  results with doclist markers (`_title`, `_rowAction`) — shows "Aucun résultat"
  instead of infinite skeleton.
- **Status maps aligned**: added `deposited`, `received` to InvoiceViewer; added
  `IN_HAND`, `APPROVED`, `PARTIALLY_APPROVED`, `COMPLETED`, `SUSPENDED` to
  StatusTimeline. All statuses now render with proper badges in all viewers.
- **`canReceivePayment`**: added `delivered` to valid statuses for outbound
  invoices (was missing a valid Iopole transition).
- **`consumeToolResult` guard tightened**: no longer uses `count` as a doclist
  signal (could match entity API responses). Requires `_title` or `_rowAction`.
- **Search description fix**: removed `state` from advertised Lucene fields
  (causes 400 error on Iopole API).
- **Generic detail panel**: nested objects (postalAddress, legalUnit) are now
  flattened into readable cards instead of raw JSON blobs.
- **No infinite refresh**: INBOUND invoices and terminal statuses no longer
  trigger `refreshRequest`, preventing endless 15s polling loops.
- **Removed "Marquer lu" button** from InvoiceViewer and InlineDetailPanel
  (opaque mechanism, no visual feedback).
- **VAT regime enum**: `entity_configure` tool now uses real Iopole values
  (REAL_MONTHLY_TAX_REGIME, etc.) instead of incorrect placeholders.
- **Flavor enums corrected**: CII (`EN16931|EXTENDED`), UBL
  (`EN16931|PEPPOL_BIS_3`), Factur-X (`BASICWL|EN16931|EXTENDED`). Removed
  invalid values (MINIMUM, BASIC_WL, BASIC).
- **`identifier_create` missing `type` field**: added required `type` param
  (`ROUTING_CODE|SUFFIX`).
- **`create_legal`/`create_office` API schema**: now sends
  `identifierScheme`/`identifierValue` instead of bare `siren`/`siret` (was
  causing 400 errors).
- **Direction labels**: "Émise/Reçue" → "Sortante/Entrante" to avoid confusion
  with ISSUED status.
- **Status terminology**: "Acceptée" → "Approuvée", "Litigieuse" → "Contestée",
  aligned with Iopole API.
- **InvoiceViewer crash fix**: `canReceivePayment` variable reference was not
  renamed after refactoring, causing undefined error.

### Documentation

- `CLAUDE.md` updated with all session learnings
- `src/adapters/README.md` enriched with PUSH/PULL mode, sandbox behavior, VAT
  regimes, enums
- `src/adapters/api-specs/` — 6 complete OpenAPI 3.0.1 JSON specs from Iopole
  Swagger

## 0.1.1 (2026-03-18)

- Initial release with 38 tools, 5 viewers
- Invoice lifecycle (emit, search, get, download, status)
- Directory search (French PPF + Peppol international)
- Operator config (entities, enrollment, network registration)
- MCP Apps viewers: invoice-viewer, doclist-viewer, status-timeline,
  directory-card, action-result
