# UX Deep Review — MCP Apps e-invoicing

Date: 2026-03-17
Status: Complete

## Methodology

All 4 viewers tested via the test-harness.html (mock MCP Apps host) with 6 scenarios:
sent-delivered, received-delivered, preview, search-results, status-history, directory-result.

Visual review done via Chrome automation with screenshots and GIF capture.

## Overall Assessment

The visual design system is **solid** — consistent colors, typography, branding, and spacing
across all viewers. The UX problems are at the **interaction and workflow level**, not the
visual level.

### What's excellent
- Shared theme system with CSS variables + light/dark mode
- Iopole branding header/footer everywhere
- Status badge colors consistent across viewers
- Info grid layout (emetteur, destinataire, dates) is clear and readable
- Line items table is well-formatted (aligned, monospace numbers)
- Totals block (HT, TVA, TTC) is visually strong
- Unified button bar (after P0 fix) — consistent across all states

### What needs work
See findings below, ordered by user impact.

---

## Finding 1: No navigation between viewers (HIGH)

**Problem**: When looking at an invoice, there's no way to:
- See the status history (need to go back to conversation and ask)
- View the sender/receiver in the directory
- Return to the invoice list

**In a traditional ERP**, these are hyperlinks. In MCP Apps, the conversation is the
navigation layer. But we could add **contextual navigation buttons** that call the
relevant tools.

**Recommendation**: Add navigation buttons to the invoice-viewer:
```
[Historique des statuts] → calls einvoice_status_history
[Voir dans l'annuaire]  → calls einvoice_directory_fr_search with sender SIRET
```

These would use `app.callServerTool()` just like action buttons, but for navigation
instead of state changes.

**Impact**: This would make the invoice-viewer a mini hub instead of a dead end.

---

## Finding 2: Actions not sequential per lifecycle (HIGH)

**Problem**: A received DELIVERED invoice shows ALL possible actions:
Accepter, Rejeter, Contester, Paiement envoyé, Marquer lu, PDF

But the Iopole lifecycle is sequential:
```
DELIVERED → (Accepter | Rejeter | Contester)
APPROVED → Paiement envoyé
PAYMENT_SENT → (no more actions, terminal)
```

Showing "Paiement envoyé" when the invoice isn't even accepted yet is confusing
and could lead to incorrect workflow.

**Recommendation**: Filter actions based on CURRENT status:

| Current Status | Available Actions |
|---------------|-------------------|
| DELIVERED / IN_HAND | Accepter, Rejeter, Contester |
| APPROVED | Paiement envoyé |
| DISPUTED | Accepter, Rejeter |
| All non-terminal | Marquer lu, PDF |
| Terminal | PDF only |

---

## Finding 3: Doclist title always says "Documents" (MEDIUM)

**Problem**: The doclist-viewer always shows "Documents" as the title, whether it's
displaying invoices, directory entries, webhooks, or statuses.

**Recommendation**: Add a `_title` field to tool results that the doclist displays:
```json
{
  "data": [...],
  "_title": "Factures",
  "_rowAction": { ... }
}
```

The viewer would use `data._title ?? data.doctype ?? "Documents"`.

---

## Finding 4: Status badges missing in doclist (MEDIUM)

**Problem**: The doclist-viewer has a `StatusCell` component that colors status values,
but in the screenshots, statuses appear as plain text (DELIVERED, ACCEPTED, INVALID
without colors).

**Root cause**: The `isStatusField()` check likely doesn't match the column name "Statut"
(uppercase S, French). Need to verify and fix the matching.

**Impact**: Without color badges, the list loses scannability. Users can't quickly
spot which invoices need attention.

---

## Finding 5: StatusTimeline doesn't render in test harness (LOW)

**Problem**: The timeline viewer stays on skeleton/dark background in the test harness.
React doesn't mount. Works in Claude Desktop (confirmed via MCP logs).

**Root cause**: Likely a timing issue with `App.connect()` in the iframe context of the
test harness. The initialize handshake completes (logs confirm) but React mount fails
silently.

**Impact**: Low — only affects testing, not production. But should be fixed for the
test harness to be useful for all 4 viewers.

---

## Finding 6: No confirmation for destructive actions (LOW)

**Problem**: Clicking "Rejeter" immediately sends a REFUSED status. No confirmation
dialog. In a real workflow, refusing an invoice is a significant action.

**Recommendation**: For destructive actions (Rejeter, Contester), show a confirmation
step. Could be:
- A second click confirmation ("Cliquez à nouveau pour confirmer")
- Or change the button text temporarily ("Confirmer le rejet ?")

Accepter and Paiement don't need confirmation (positive actions).

---

## Finding 7: No batch actions on doclist (FUTURE)

**Problem**: Can't select multiple invoices to accept/reject in bulk. Each invoice
must be opened individually.

This is a fundamental MCP Apps limitation — each viewer is a single iframe with one
tool result. Batch operations would require a new pattern (multi-select in doclist
that calls a tool for each selected row).

**Recommendation**: Track as a future enhancement. Could be implemented with checkboxes
in doclist + a "Accepter la sélection" button that loops over selected IDs.

---

## Prioritized Action Plan

| # | Finding | Priority | Effort |
|---|---------|----------|--------|
| 2 | Sequential actions per lifecycle | HIGH | Small (just filter logic) |
| 3 | Doclist contextual title | MEDIUM | Tiny (add _title field) |
| 4 | Status badges in doclist | MEDIUM | Small (fix isStatusField) |
| 1 | Navigation buttons in invoice | HIGH | Medium (new buttons + tool calls) |
| 6 | Confirmation for destructive actions | LOW | Small (double-click pattern) |
| 5 | Timeline test harness fix | LOW | Small (debug mount order) |
| 7 | Batch actions | FUTURE | Large |
