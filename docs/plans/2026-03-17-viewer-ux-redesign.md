# Viewer UX Redesign Plan

Date: 2026-03-17 Status: Draft

## Context

The 4 MCP Apps viewers (invoice-viewer, doclist-viewer, status-timeline,
directory-card) were built incrementally. An audit reveals **visual consistency
is strong** (shared theme, branding, status colors) but **interaction patterns
are inconsistent** across views and across invoice states.

The biggest issue: two incompatible button paradigms in the same viewer, and a
broken state transition after invoice emission.

## Current State

### What works well

- Shared color system (CSS variables, light/dark mode)
- Iopole branding header/footer on all 4 viewers
- Status badge colors consistent everywhere
- Skeleton loading with shimmer animation
- Auto-refresh on InvoiceViewer (15s interval)
- Drill-down from doclist → invoice-viewer via `_rowAction`

### What's broken

1. **Two button paradigms** — "Deposer la facture" is full-width/prominent,
   action buttons (Accepter/Rejeter) are small/inline
2. **Apercu state leak** — after emit, `id` stays `"(apercu)"`, no real invoice
   ID, no action buttons
3. **Drill-down feedback** — row opacity dims but no spinner/text
4. **Error handling** — DoclistViewer silently swallows drill-down errors
5. **Table overflow** — InvoiceViewer table not scrollable on mobile

## Design Decisions

### D1 — Unified action button bar

**Decision**: All invoice states use the same `ActionButton` component in a
horizontal row. No special full-width button for "Deposer".

**Rationale**:

- Consistent visual hierarchy across all states
- "Deposer" is a state transition like "Accepter" — same importance level
- Reduces cognitive load (one pattern to learn)

**Before**:

```
[Preview] → full-width green "Deposer la facture"
[Sent]    → small buttons: Paiement recu | Marquer lu | PDF
[Received]→ small buttons: Accepter | Rejeter | Contester | ...
```

**After**:

```
[Preview] → Deposer (success) | Annuler (default)
[Sent]    → Paiement recu (success) | Marquer lu | PDF
[Received]→ Accepter (success) | Rejeter (error) | Contester (info) | ...
[Terminal]→ Marquer lu | PDF (always available)
```

### D2 — Emit returns real invoice ID

**Decision**: After emit, parse the Iopole response
`{ type: "INVOICE", id: "uuid" }` and update the viewer with the real ID.

**Rationale**:

- Enables action buttons after emit (hasId becomes true)
- Removes sentinel value "(apercu)" from post-emit state
- Enables auto-refresh to track the real invoice

**Implementation**:

```tsx
// In InvoiceViewer emit handler:
const result = await callAction("emit", "einvoice_invoice_emit", {
  generated_id,
}, "");
if (result) {
  // Parse response to get real ID
  const emitResponse = JSON.parse(result);
  hydrateData({
    ...data,
    id: emitResponse.id,
    status: "deposited",
    generated_id: undefined,
  });
}
```

### D3 — Drill-down loading indicator

**Decision**: Add an inline loading badge next to the clicked row during
drill-down.

**Rationale**:

- Opacity dimming is too subtle for network latency
- Prevents double-clicks
- Consistent with action button loading pattern

### D4 — Error display standardization

**Decision**: All viewers display errors in a styled card (colored background,
border, icon).

**Before**: `<div style={{ color: colors.error }}>{error}</div>`

**After**:

```tsx
<ErrorBanner message={error} onDismiss={() => setError(null)} />;
```

Shared component in `~/shared/ErrorBanner.tsx`.

### D5 — Table horizontal scroll on mobile

**Decision**: Wrap all tables in `<div style={{ overflowX: "auto" }}>`.

DoclistViewer already does this. InvoiceViewer doesn't. Align both.

## Action Items

| # | Task                                                    | Priority | Files                                 |
| - | ------------------------------------------------------- | -------- | ------------------------------------- |
| 1 | Unify button bar (remove full-width Deposer)            | P0       | InvoiceViewer.tsx                     |
| 2 | Emit returns real ID + update viewer state              | P0       | InvoiceViewer.tsx                     |
| 3 | Drill-down loading indicator                            | P0       | DoclistViewer.tsx                     |
| 4 | Error display standardization                           | P1       | all viewers + shared/                 |
| 5 | Table overflow fix                                      | P1       | InvoiceViewer.tsx                     |
| 6 | Extract ACTION_KEYS constant                            | P2       | InvoiceViewer.tsx                     |
| 7 | Add empty state icons to InvoiceViewer + StatusTimeline | P2       | InvoiceViewer.tsx, StatusTimeline.tsx |
| 8 | ARIA attributes                                         | P3       | all viewers                           |

## Success Criteria

- All invoice states use the same button bar pattern
- After emit, viewer shows real invoice ID and correct action buttons
- Drill-down has clear loading feedback
- No silent error swallowing
- Tables scroll horizontally on narrow viewports
