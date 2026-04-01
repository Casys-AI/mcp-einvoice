# Doclist Viewer — Contract

## Purpose

Generic sortable/filterable table for displaying lists of documents. Used by
invoice search, unseen invoices, unseen statuses, webhook list, directory
search.

## Inputs

MCP tool result with shape:

```typescript
interface DoclistData {
  data: Record<string, unknown>[]; // rows (auto-detect columns)
  count?: number; // total result count
  meta?: { offset: number; limit: number; count: number };
  _rowAction?: { // drill-down config
    toolName: string; // e.g. "einvoice_invoice_get"
    idField: string; // key in row data, e.g. "_id"
    argName: string; // tool argument name, e.g. "id"
  };
}
```

### Column Detection

Columns are auto-detected from the first row's keys. Keys starting with `_` are
hidden (used for metadata like `_id`, `_identifiers`).

## Outputs (Actions)

### Drill-down

When `_rowAction` is present, clicking a row calls the specified tool with the
row's ID. This triggers a **viewer transition** — the host loads the target
viewer (e.g. invoice-viewer) with the drill-down result.

### Built-in Actions

| Action         | Trigger             | Notes                              |
| -------------- | ------------------- | ---------------------------------- |
| Sort by column | Click column header | Toggles asc/desc                   |
| Filter         | Text input          | Searches across all visible fields |
| CSV Export     | "CSV" button        | Downloads all rows as CSV          |
| Refresh        | "Rafraichir" button | Re-calls the original tool         |

## Error Handling

- Drill-down errors MUST be displayed to the user (not silently swallowed)
- Loading state MUST be visible during drill-down (spinner or badge)

## Auto-refresh

- No auto-refresh timer (lists are query results, not live data)
- Refreshes on tab focus/visibility change
- Manual refresh via button

## Invariants

- Status columns auto-apply colored badges (DELIVERED → blue, ACCEPTED → green,
  etc.)
- Hidden columns (`_`-prefixed) are never rendered but accessible for drill-down
- Pagination via "load more" button (PAGE_SIZE = 20)
- Table is horizontally scrollable on narrow viewports
