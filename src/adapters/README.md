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

**Local API specs:** Full OpenAPI 3.0.1 JSON specs are in `docs/api-specs/` (6 files, fetched from Swagger).

## Iopole API Resources (43 tools)

| Resource | Endpoints | MCP Tools |
|----------|-----------|-----------|
| Account | `GET /config/customer/id` | `einvoice_config_customer_id` (1) |
| Invoice | `POST /invoice`, `GET /invoice/{id}`, `GET /v1.1/invoice/search`, `GET /invoice/notSeen`, `PUT /invoice/{id}/markAsSeen`, downloads (5 endpoints) | `einvoice_invoice_*` (13 tools) |
| Status | `POST /invoice/{id}/status`, `GET /invoice/{id}/status-history`, `GET /invoice/status/notSeen`, `PUT /invoice/status/{id}/markAsSeen` | `einvoice_status_*` (4 tools) |
| Directory | `GET /directory/french`, `GET /directory/international`, `GET /directory/international/check/...` | `einvoice_directory_*` (3 tools) |
| Reporting | `POST /reporting/fr/invoice/transaction`, `POST /reporting/fr/transaction/{entityId}` | `einvoice_reporting_*` (2 tools) |
| Webhook | CRUD (5 endpoints) | `einvoice_webhook_*` (5 tools) |
| Tools | `POST /tools/{cii\|ubl\|facturx}/generate` | `einvoice_invoice_generate_*` (3 tools) |
| Config | Entity CRUD, enrollment, claim, identifier, network registration (21 endpoints) | `einvoice_config_*` (12 tools) |

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

## PUSH vs PULL Mode

Iopole supports two delivery modes, controlled by webhook configuration:

**PUSH mode (webhook active):** Iopole sends invoices/statuses to a `callbackUrl`. Once delivered successfully, items are automatically marked as "seen" → `notSeen` endpoints return empty.

**PULL mode (no webhook):** No automatic delivery. Invoices/statuses accumulate in the `notSeen` queue. The operator polls periodically and marks items as seen via `markAsSeen`.

The sandbox has a default ACTIVE webhook pointing to `labs.iopole.io`:
```
webhookId: (auto-created)
label: "xxx@gmail.com sandbox client endpoint"
callbackUrl: https://labs.iopole.io/v1/receipt/invoice
status: ACTIVE
```
This means `notSeen` always returns `[]` in the sandbox — items are immediately delivered to the lab webhook.

### seen/notSeen behavior

- `seen` field is **NOT exposed** in search results or `getInvoice` responses
- `markAsSeen` returns 200 OK but has no visible effect on invoice data
- `notSeen` returns items only in PULL mode (no active webhook)
- `seen` is **NOT a valid Lucene search field** (returns 400)
- The only way to know unseen items is via the `notSeen` endpoint

## Sandbox-specific Behavior

- **Self-receive works:** same operator can emit from entity A and receive on entity B. Both OUTBOUND and INBOUND copies appear in search.
- **INBOUND copies have separate invoice IDs** from their OUTBOUND counterparts
- **INBOUND copies have no status history** — `getStatusHistory` returns empty. Status is only in the search index (`metadata.state`).
- **`getInvoice` returns no `state` field** — status must be fetched from `getStatusHistory` (OUTBOUND) or from search results (INBOUND).
- **Outbound lifecycle is automatic:** SUBMITTED → RECEIVED → ISSUED → MADE_AVAILABLE → DELIVERED (seconds, not days)

## VAT Regimes

Valid values for `configureBusinessEntity`:
- `REAL_MONTHLY_TAX_REGIME` — Régime réel mensuel
- `REAL_QUARTERLY_TAX_REGIME` — Régime réel trimestriel
- `SIMPLIFIED_TAX_REGIME` — Régime simplifié
- `VAT_EXEMPTION_REGIME` — Franchise de TVA

## Enums Reference

| Enum | Values |
|------|--------|
| Network | `DOMESTIC_FR`, `PEPPOL_INTERNATIONAL` |
| Entity type | `LEGAL_UNIT`, `OFFICE` |
| Entity scope | `PRIVATE_TAX_PAYER`, `PUBLIC`, `PRIMARY`, `SECONDARY` |
| Identifier type | `LEGAL_IDENTIFIER`, `OFFICE_IDENTIFIER`, `ROUTING_CODE`, `SUFFIX` |
| Invoice format | `FACTURX`, `CII`, `UBL` |
| FacturX flavor | `BASICWL`, `EN16931`, `EXTENDED` |
| Process type | `B1`, `S1`, `M1`, `B2`, `S2`, `M2`, `S3`, `B4`, `S4`, `M4`, `S5`, `S6`, `B7`, `S7` |
| Status codes | `IN_HAND`, `APPROVED`, `PARTIALLY_APPROVED`, `DISPUTED`, `SUSPENDED`, `COMPLETED`, `REFUSED`, `PAYMENT_SENT`, `PAYMENT_RECEIVED` |

## Rate Limiting

TCP-level: 3,600 requests/min per source IP.
HTTP-level rate limits per endpoint are planned but not yet enforced.

## Adding a New Adapter

1. Implement `EInvoiceAdapter` interface from `../adapter.ts`
2. Add a factory function (e.g. `createChorusProAdapter()`)
3. Register in `mod.ts`
4. Update `createAdapter()` in `server.ts`
