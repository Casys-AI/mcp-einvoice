# Changelog

## 0.2.0 (2026-03-18)

### Breaking changes

- **Removed 4 seen/unseen tools**: `einvoice_invoice_not_seen`, `einvoice_invoice_mark_seen`, `einvoice_status_not_seen`, `einvoice_status_mark_seen`. Iopole's seen/unseen mechanism is opaque — `seen` is not exposed in search or getInvoice responses, and `notSeen` always returns empty when a webhook is active (PUSH mode). The sandbox has an active webhook by default, making these tools unusable. The adapter methods remain available for future use in PULL mode.
- **Removed directory drill-down**: `einvoice_directory_fr_search` no longer has `_rowAction` pointing to `einvoice_config_entity_get`. The directory returns public entity IDs that don't work with the operator-scoped entity_get endpoint.
- **"deposited" → "submitted"**: after emitting an invoice, the viewer now shows status "Soumise" (submitted) instead of the legacy "deposited".

### New features

- **Doclist inline drill-down**: clicking a row in the doclist viewer expands an inline detail panel below the row with invoice data, action buttons (Accepter/Rejeter/Contester/Paiement), and a "Détails complets" navigation button. Chevron ▶ indicator rotates on expansion.
- **Status enrichment**: `einvoice_invoice_get` now fetches `getStatusHistory` in parallel via `Promise.all` to get the real status — Iopole's `getInvoice` has no `state` field.
- **INBOUND status fallback**: when drilling down on a received invoice (which has no status history), the status is copied from the doclist row data.
- **Auto-refresh after action**: after clicking an action button in the inline panel, the detail and list refresh automatically after 2.5s.
- **5 new config tools** (43 → 39 total after removing seen tools): `einvoice_config_identifier_create`, `einvoice_config_identifier_create_by_scheme`, `einvoice_config_identifier_delete`, `einvoice_config_entity_configure` (VAT regime), `einvoice_config_claim_delete`.
- **Entity create fix**: `create_legal` and `create_office` now include `scope` field (required by Iopole, default: PRIMARY).
- **Iopole API specs imported**: 6 OpenAPI JSON specs in `docs/api-specs/` for offline reference.

### Bug fixes

- **Empty doclist skeleton fix**: `consumeToolResult` guard now handles empty results with doclist markers (`_title`, `_rowAction`) — shows "Aucun résultat" instead of infinite skeleton.
- **Status maps aligned**: added `deposited`, `received` to InvoiceViewer; added `IN_HAND`, `APPROVED`, `PARTIALLY_APPROVED`, `COMPLETED`, `SUSPENDED` to StatusTimeline. All statuses now render with proper badges in all viewers.
- **`canReceivePayment`**: added `delivered` to valid statuses for outbound invoices (was missing a valid Iopole transition).
- **`consumeToolResult` guard tightened**: no longer uses `count` as a doclist signal (could match entity API responses). Requires `_title` or `_rowAction`.
- **Search description fix**: removed `state` from advertised Lucene fields (causes 400 error on Iopole API).
- **Generic detail panel**: nested objects (postalAddress, legalUnit) are now flattened into readable cards instead of raw JSON blobs.
- **No infinite refresh**: INBOUND invoices and terminal statuses no longer trigger `refreshRequest`, preventing endless 15s polling loops.
- **Removed "Marquer lu" button** from InvoiceViewer and InlineDetailPanel (opaque mechanism, no visual feedback).
- **VAT regime enum**: `entity_configure` tool now uses real Iopole values (REAL_MONTHLY_TAX_REGIME, etc.) instead of incorrect placeholders.

### Documentation

- `CLAUDE.md` updated with all session learnings
- `src/adapters/README.md` enriched with PUSH/PULL mode, sandbox behavior, VAT regimes, enums
- `docs/api-specs/` — 6 complete OpenAPI 3.0.1 JSON specs from Iopole Swagger

## 0.1.1 (2026-03-18)

- Initial release with 38 tools, 5 viewers
- Invoice lifecycle (emit, search, get, download, status)
- Directory search (French PPF + Peppol international)
- Operator config (entities, enrollment, network registration)
- MCP Apps viewers: invoice-viewer, doclist-viewer, status-timeline, directory-card, action-result
