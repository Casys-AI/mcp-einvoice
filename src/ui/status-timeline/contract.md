# Status Timeline — Contract

## Purpose

Vertical timeline displaying the chronological status history of an invoice.
Read-only view — no actions available.

## Inputs

MCP tool result from `einvoice_status_history`:

```typescript
interface TimelineData {
  entries: StatusEntry[];
}

interface StatusEntry {
  date: string; // ISO 8601 timestamp
  code: string; // DEPOSITED, DELIVERED, APPROVED, etc.
  message?: string; // optional comment
}
```

## Outputs

None. This viewer is read-only (no action buttons, no drill-down).

## Visual Design

- Vertical line connecting status dots
- Each entry: colored dot (status color) + date + code badge + message
- Most recent entry at top
- Status dot colors match the shared INVOICE_STATUS map

## Auto-refresh

- No auto-refresh timer
- Refreshes on tab focus/visibility change

## Invariants

- Status badge colors MUST be consistent with InvoiceViewer
- Entries are displayed in reverse chronological order (newest first)
- Empty state: "Aucun historique de statut"
