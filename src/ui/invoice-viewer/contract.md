# Invoice Viewer — Contract

## Purpose

Display a single invoice with full detail and contextual action buttons. Covers
all invoice states: preview (apercu), deposited, delivered, accepted, rejected,
disputed, paid.

## Inputs

MCP tool result from:

- `einvoice_invoice_get` — existing invoice from Iopole
- `einvoice_invoice_generate_cii/ubl/facturx` — preview before emission
  (contains `generated_id` + `preview`)

### Data Shape

```typescript
interface InvoiceData {
  id: string; // Iopole UUID or "(apercu)" for previews
  invoice_number?: string; // e.g. "CASYS-001"
  status?: string; // DELIVERED, ACCEPTED, REFUSED, apercu, etc.
  direction?: string; // "sent" | "received"
  format?: string; // FACTURX, CII, UBL
  network?: string; // DOMESTIC_FR, PEPPOL
  sender_name?: string;
  receiver_name?: string;
  issue_date?: string; // YYYY-MM-DD
  due_date?: string;
  currency?: string; // default "EUR"
  total_ht?: number;
  total_tax?: number;
  total_ttc?: number;
  items?: InvoiceItem[];
  notes?: string[];
  generated_id?: string; // present only for previews (generate flow)
}
```

## Outputs (Actions)

Actions are MCP tool calls via `app.callServerTool()`:

| State                          | Available Actions                             | Tool Called                               |
| ------------------------------ | --------------------------------------------- | ----------------------------------------- |
| Preview (generated_id present) | Deposer                                       | `einvoice_invoice_emit`                   |
| Sent + non-terminal            | Paiement recu                                 | `einvoice_status_send` (PAYMENT_RECEIVED) |
| Received + non-terminal        | Accepter, Rejeter, Contester, Paiement envoye | `einvoice_status_send`                    |
| All non-preview                | Marquer lu                                    | `einvoice_invoice_mark_seen`              |
| All non-preview                | Telecharger PDF                               | `einvoice_invoice_download_readable`      |
| Terminal                       | Marquer lu, PDF only                          | —                                         |

Terminal statuses: accepted, approved, rejected, refused, paid, completed,
cancelled, payment_received.

## Auto-refresh

- Interval: 15 seconds
- Paused when tab is hidden (visibility API)
- Triggered immediately on focus/visibility change
- Uses `refreshRequest` from tool result if present

## Invariants

- Action buttons use the unified `ActionButton` component (no special full-width
  buttons)
- Status badge colors match the shared INVOICE_STATUS map
- Handles both "apercu" and "aperçu" (with/without accent)
- After emit, updates the invoice ID from the API response
- Generated files are consumed on retrieval (single-use)
