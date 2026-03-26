# Changelog

## 0.1.6 (2026-03-26)

### Added
- **Deno Deploy support**: auto-detect runtime via `DENO_DEPLOYMENT_ID`, bind `0.0.0.0`, read `PORT` env var
- **Deploy config**: `deno.json` includes deploy org/app for `deno deploy` CLI

### Notes
- No impact on existing consumers (stdio, HTTP local, npm package)
- OAuth2 auth via `mcp-server.yaml` coming in next release

## 0.1.3 (2026-03-23)

### Fixed
- **status-timeline skeleton**: viewer expected nested `status.code` but tool sends flat `code` — was stuck in loading forever
- **webhook_list skeleton**: missing `{ content, structuredContent }` wrapper — doclist-viewer never received data
- **config_entities_list skeleton**: same structuredContent wrapper missing
- **status chips incorrect**: hardcoded RECEIVED/SENT status sets replaced with data-driven chips derived from filtered rows (PA-agnostic)

### Added
- **Structured logging**: every tool call logged with name + duration (`[mcp-einvoice] einvoice_invoice_search ok (1423ms)`)
- **Directory-list enriched**: network registration details (PPF France, Peppol, routing address) shown under each identifier
- **Compact column widths**: Direction 40px, Status 48px, Date 80px — more space for text columns
- **Inline confirmation bar**: ActionButton `confirm` now shows `[Action ?] [Confirmer] [✕]` instead of double-click pattern
- **confirm on all irreversible actions**: accept, payment_sent, payment_received now require confirmation
- **i18n navigation prompts**: sendMessage strings use `t()` keys (nav_status_history, nav_directory_sender, nav_invoice_detail)
- **destType labels**: OPERATOR and PPF mapped to translated labels in status timeline
- **entry.message display**: StatusTimeline shows rejection reasons inline below status badge
- **prefers-reduced-motion**: skeleton shimmer and pulse animations disabled for motion-sensitive users
- **FeedbackBanner consistency**: DirectoryList and DirectoryCard use shared FeedbackBanner instead of raw error divs
- **ActionResult raw fallback**: shows raw text content when JSON parsing fails instead of empty state
- **Accessibility (a11y)**: `aria-sort` on sortable table headers, `aria-expanded` on expand/collapse cards, `aria-label` on search inputs and CSV export, keyboard nav (Enter/Space) on directory cards

### Changed
- **Filter chips toggle**: removed "Tous" chip — click active chip to deselect (standard toggle pattern)

### Chore
- `deno fmt` applied to all files
- `deno lint` clean (0 issues, lint rules configured in deno.json)
- `.cov/` added to .gitignore

## 0.1.2 (2026-03-23)

### Fixed
- **TS4114**: add `override` modifier to 8 AfnorBaseAdapter methods — tests were blocked
- **BR-FR-12 silent corruption**: SuperPDP normalizer now throws when buyer has no SIRET instead of fabricating `"0000000000000"`
- **BR-FR-12 scope**: electronic_address check now only applies to French buyers (country=FR)
- **OAuth2 hang**: token fetch now has a 15s timeout via `AbortSignal.timeout()`
- **Iopole auth/API mismatch**: default auth URL changed from production to sandbox (`auth.ppd.iopole.fr`)
- **SuperPDP pagination**: removed incorrect `offset → starting_after_id` mapping
- **Misleading count**: invoice search count now reflects post-filtered rows
- **HTTP exposure**: default hostname changed from `0.0.0.0` to `localhost`
- **E2E tests**: all E2E tests now use `unwrapStructured` for structuredContent responses
- **Storecove adapter**: added missing imports, `override` modifiers, type coercion fix

### Added
- 164 unit tests: config tools (58), Storecove adapter (51), AFNOR client (21), AFNOR base-adapter (34)
- Total test count: 205 → 369

### Removed
- `error-handler.ts` (dead code — replaced by framework-level `toolErrorMapper`)

### Docs
- README updated to match current architecture (BaseAdapter hierarchy, 6 viewers, correct tool counts)
