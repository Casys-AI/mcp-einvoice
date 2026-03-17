# Adapters — PA-agnostic e-invoicing

This directory contains platform adapter implementations for the `EInvoiceAdapter` interface.

## Current Adapters

### Iopole (`iopole.ts`)

French e-invoicing platform (Plateforme Agreee / PDP).

**Documentation:**
- API Reference: https://docs.ppd.iopole.fr/docs/iopole-api/reference
- Swagger (sandbox): https://api.ppd.iopole.fr/v1/api/
- Swagger (production): https://api.iopole.com/v1/api/

**Environments:**
| Environment | API Base | Auth URL |
|-------------|----------|----------|
| Sandbox (ppd) | `https://api.ppd.iopole.fr/v1` | `https://auth.ppd.iopole.fr/realms/iopole/protocol/openid-connect/token` |
| Production | `https://api.iopole.com/v1` | `https://auth.iopole.com/realms/iopole/protocol/openid-connect/token` |

**Authentication:** OAuth2 client_credentials grant. Token TTL = 10 min. Auto-refreshed 60s before expiry.

**Required headers:** `Authorization: Bearer {token}`, `customer-id: {uuid}` (mandatory since 2026-02-01).

## Iopole API Resources

| Resource | Endpoints | MCP Tools |
|----------|-----------|-----------|
| Account | `GET /account/customerId` | — |
| Invoice | `POST /invoice`, `GET /invoice/{id}`, `GET /invoice/search`, `GET /invoice/notSeen`, `PUT /invoice/{id}/markAsSeen`, `GET /invoice/{id}/download`, `GET /invoice/{id}/download/readable`, `GET /invoice/{id}/files`, `GET /invoice/{id}/files/attachments`, `GET /invoice/file/{id}/download` | `einvoice_invoice_*` (13 tools) |
| Status | `POST /invoice/{id}/status`, `GET /invoice/{id}/status-history`, `GET /invoice/status/notSeen`, `PUT /invoice/status/{id}/markAsSeen` | `einvoice_status_*` (4 tools) |
| Directory | `GET /directory/french`, `GET /directory/international`, `GET /directory/international/check/scheme/{s}/value/{v}` | `einvoice_directory_*` (3 tools) |
| Reporting | `POST /reporting/fr/invoice/transaction`, `POST /reporting/fr/transaction/{entityId}` | `einvoice_reporting_*` (2 tools) |
| Webhook | `GET /config/webhook`, `GET /config/webhook/{id}`, `POST /config/webhook`, `PUT /config/webhook/{id}`, `DELETE /config/webhook/{id}` | `einvoice_webhook_*` (5 tools) |
| Tools | `POST /tools/cii/generate`, `POST /tools/ubl/generate`, `POST /tools/facturx/generate` | `einvoice_invoice_generate_*` (3 tools) |

## Invoice Lifecycle (Iopole)

```
Outbound (sent):
  EMIT → DEPOSITED → DELIVERED → [wait for receiver status]
                                   ↓
                              PAYMENT_RECEIVED → COMPLETED

Inbound (received):
  DELIVERED → IN_HAND → APPROVED → PAYMENT_SENT → COMPLETED
                      → REFUSED
                      → DISPUTED → APPROVED / REFUSED
                      → PARTIALLY_APPROVED → PAYMENT_SENT
                      → SUSPENDED
```

### Valid status transitions (used by invoice-viewer action buttons)

| Current Status | Valid Next Statuses | Who |
|---------------|-------------------|-----|
| DELIVERED | IN_HAND, APPROVED, REFUSED, DISPUTED | Receiver |
| IN_HAND | APPROVED, REFUSED, DISPUTED | Receiver |
| DISPUTED | APPROVED, REFUSED | Receiver |
| APPROVED | PAYMENT_SENT | Receiver |
| PARTIALLY_APPROVED | PAYMENT_SENT | Receiver |
| PAYMENT_SENT | COMPLETED | System |
| DELIVERED (outbound) | PAYMENT_RECEIVED | Sender |
| APPROVED (outbound) | PAYMENT_RECEIVED | Sender |

### Terminal statuses (no further actions)
`REFUSED`, `COMPLETED`, `CANCELLED`, `PAYMENT_RECEIVED`

## API Flows

### Inbound (PULL mode)
1. Poll `GET /invoice/notSeen` periodically
2. For each unseen invoice: `GET /invoice/{id}/download`
3. Mark as seen: `PUT /invoice/{id}/markAsSeen`
4. Send status: `POST /invoice/{id}/status` (IN_HAND, APPROVED, etc.)

### Inbound (PUSH mode)
1. Configure webhook with `callbackUrl` for invoice events
2. Iopole POSTs to your callback URL
3. Download invoice: `GET /invoice/{id}/download`
4. Send status: `POST /invoice/{id}/status`

### Outbound
1. Emit invoice: `POST /invoice` (multipart form-data, PDF or XML)
2. Iopole returns a GUID (async)
3. Poll `GET /invoice/status/notSeen` for status updates
4. Mark statuses as seen: `PUT /invoice/status/{id}/markAsSeen`

### Generate + Preview + Emit
1. Generate: `POST /tools/{cii|ubl|facturx}/generate` with invoice data
2. Preview in invoice-viewer (stored in temp memory, 10min expiry)
3. Emit: `POST /invoice` with the generated file

## Search Syntax

Iopole uses Lucene-like query syntax for invoice search (`/v1.1/invoice/search`):

**Valid fields:** `senderName`, `receiverName`, `invoiceId`

**NOT valid:** `status`, `direction`, `state` (these cause 400 errors)

To filter by status, use `GET /invoice/notSeen` or client-side filtering after search.

## Rate Limiting

TCP-level: 3,600 requests/min per source IP.
HTTP-level rate limits per endpoint are planned but not yet enforced.

## Adding a New Adapter

1. Implement `EInvoiceAdapter` interface from `../adapter.ts`
2. Add a factory function (e.g. `createChorusProAdapter()`)
3. Register in `mod.ts`
4. Update `createAdapter()` in `server.ts`
