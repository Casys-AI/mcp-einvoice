# Super PDP Adapter

Super PDP is a French PA (Plateforme Agréée) — API-first, developer-friendly,
cheapest on the market. Complementary to Iopole (established PDP) and Storecove
(Peppol AP) — third proof of PA-agnosticism.

## API Overview

- **Host**: `api.superpdp.tech`
- **Base path**: `/v1.beta`
- **Auth**: OAuth2 (authorization_code + client_credentials) — token endpoint:
  `/oauth2/token`
- **Sandbox**: Built-in sandbox mode per company (no separate environment)
- **Specs**: `api-specs/superpdp.json` (OpenAPI 3.0.4, 76 schemas) +
  `api-specs/afnor-flow.json` (AFNOR XP Z12-013)
- **Doc**: https://www.superpdp.tech/openapi/

## Two APIs

### 1. Super PDP API (native) — 14 endpoints

The main API. Simple, modern, well-designed.

| Group                 | Method | Path                              | Description                                 |
| --------------------- | ------ | --------------------------------- | ------------------------------------------- |
| **invoices**          | POST   | `/invoices`                       | Create (send) an invoice                    |
|                       | GET    | `/invoices`                       | List invoices (direction, date, pagination) |
|                       | GET    | `/invoices/{id}`                  | Get invoice details                         |
|                       | GET    | `/invoices/{id}/download`         | Download raw invoice file (XML or PDF)      |
|                       | POST   | `/invoices/convert`               | Convert invoice format (CII↔UBL↔Factur-X)   |
|                       | GET    | `/invoices/generate_test_invoice` | Download a test invoice (sandbox)           |
|                       | POST   | `/validation_reports`             | Validate invoices                           |
| **invoice_events**    | GET    | `/invoice_events`                 | List invoice lifecycle events               |
|                       | POST   | `/invoice_events`                 | Create an invoice event (status change)     |
| **directory_entries** | GET    | `/directory_entries`              | List directory entries (own company)        |
|                       | POST   | `/directory_entries`              | Create directory entry                      |
|                       | GET    | `/directory_entries/{id}`         | Get directory entry                         |
|                       | DELETE | `/directory_entries/{id}`         | Delete directory entry                      |
| **companies**         | GET    | `/companies/me`                   | Get current company info                    |

### 2. AFNOR Flow API — 4 endpoints

The interoperable API standardized by AFNOR (XP Z12-013). All French PAs must
implement it.

| Method | Path                 | Description                                    |
| ------ | -------------------- | ---------------------------------------------- |
| POST   | `/v1/flows`          | Submit a new flow (invoice, status, reporting) |
| POST   | `/v1/flows/search`   | Search flows with criteria                     |
| GET    | `/v1/flows/{flowId}` | Download a flow file                           |
| GET    | `/v1/healthcheck`    | Health check                                   |

## Key API Characteristics

### Invoice Submission

- Accepts XML body (CII, UBL, Factur-X) — `POST /invoices`
- Asynchronous: returns an `id` immediately, invoice is queued for validation +
  transmission
- `external_id` query param for caller-side tracking

### Invoice Listing / Search

- `GET /invoices` with filters: `direction` (incoming/outgoing), `date` (YYYY,
  YYYY-MM, YYYY-MM-DD)
- Pagination: cursor-based (`starting_after_id`, `ending_before_id`, `limit`)
- `expand[]` param for nested data

### Format Conversion

- `POST /invoices/convert` — convert between CII, UBL, Factur-X
- Supports multipart: combine PDF + XML → Factur-X output
- `from` / `to` params

### Invoice Events (lifecycle)

- `GET /invoice_events?invoice_id=xxx` — list status changes for an invoice
- `POST /invoice_events` — send a status change (uses French status codes like
  `fr:212`)
- Cursor-based pagination

### Directory

- `GET /directory_entries` — list YOUR company's directory entries (routing
  addresses)
- `POST /directory_entries` — register a new routing address
- No general directory search (unlike Iopole). Directory lookup may come later.

### Test / Sandbox

- `GET /invoices/generate_test_invoice` — get a ready-to-send test invoice
- Sandbox mode is per-company, not per-environment

## Mapping: EInvoiceAdapter → Super PDP API

### Invoice Operations (13 methods)

| Adapter Method      | Super PDP Endpoint                  | Notes                                |
| ------------------- | ----------------------------------- | ------------------------------------ |
| `emitInvoice`       | `POST /invoices`                    | XML body, async queue                |
| `searchInvoices`    | `GET /invoices`                     | direction + date + cursor pagination |
| `getInvoice`        | `GET /invoices/{id}`                | Direct map                           |
| `downloadInvoice`   | `GET /invoices/{id}/download`       | Returns XML or PDF                   |
| `downloadReadable`  | —                                   | No readable PDF endpoint. Stub       |
| `getInvoiceFiles`   | —                                   | Single file per invoice. Stub        |
| `getAttachments`    | —                                   | No separate attachments. Stub        |
| `downloadFile`      | —                                   | Use downloadInvoice instead. Stub    |
| `markInvoiceSeen`   | —                                   | No seen/unseen tracking. Stub        |
| `getUnseenInvoices` | —                                   | No unseen mechanism. Stub            |
| `generateCII`       | `POST /invoices/convert?to=cii`     | Format conversion                    |
| `generateUBL`       | `POST /invoices/convert?to=ubl`     | Format conversion                    |
| `generateFacturX`   | `POST /invoices/convert?to=facturx` | Multipart PDF+XML→Factur-X           |

### Directory (3 methods)

| Adapter Method           | Super PDP Endpoint       | Notes                                        |
| ------------------------ | ------------------------ | -------------------------------------------- |
| `searchDirectoryFr`      | `GET /directory_entries` | Own company only, no general search. Limited |
| `searchDirectoryInt`     | —                        | No international directory. Stub             |
| `checkPeppolParticipant` | —                        | No Peppol support. Stub                      |

### Status (4 methods)

| Adapter Method      | Super PDP Endpoint                   | Notes                                  |
| ------------------- | ------------------------------------ | -------------------------------------- |
| `sendStatus`        | `POST /invoice_events`               | Uses French status codes (fr:212 etc.) |
| `getStatusHistory`  | `GET /invoice_events?invoice_id=xxx` | Direct map, cursor-based               |
| `getUnseenStatuses` | —                                    | No unseen mechanism. Stub              |
| `markStatusSeen`    | —                                    | No seen tracking. Stub                 |

### Reporting (2 methods)

| Adapter Method             | Super PDP Endpoint     | Notes                                 |
| -------------------------- | ---------------------- | ------------------------------------- |
| `reportInvoiceTransaction` | AFNOR `POST /v1/flows` | Via AFNOR flow API (e-reporting flow) |
| `reportTransaction`        | AFNOR `POST /v1/flows` | Same — flow type determines reporting |

### Webhooks (5 methods)

| Adapter Method  | Super PDP Endpoint | Notes                    |
| --------------- | ------------------ | ------------------------ |
| `listWebhooks`  | —                  | Not in current API. Stub |
| `getWebhook`    | —                  | Stub                     |
| `createWebhook` | —                  | Stub                     |
| `updateWebhook` | —                  | Stub                     |
| `deleteWebhook` | —                  | Stub                     |

Webhook support may come via the AFNOR callback mechanism (`WebhookCallback` in
the AFNOR spec).

### Operator Config (12 methods)

| Adapter Method                    | Super PDP Endpoint               | Notes                                  |
| --------------------------------- | -------------------------------- | -------------------------------------- |
| `getCustomerId`                   | `GET /companies/me`              | Returns company info for current token |
| `listBusinessEntities`            | —                                | Single company per token. Stub         |
| `getBusinessEntity`               | `GET /companies/me`              | Same as getCustomerId                  |
| `createLegalUnit`                 | —                                | Company created at onboarding. Stub    |
| `createOffice`                    | `POST /directory_entries`        | Directory entry ≈ routing address      |
| `deleteBusinessEntity`            | —                                | Stub                                   |
| `configureBusinessEntity`         | —                                | Stub                                   |
| `claimBusinessEntity`             | —                                | Stub                                   |
| `claimBusinessEntityByIdentifier` | —                                | Stub                                   |
| `enrollFrench`                    | `POST /directory_entries`        | Registering = enrolling on PPF         |
| `enrollInternational`             | —                                | No international. Stub                 |
| `registerNetwork`                 | `POST /directory_entries`        | Directory entry = network registration |
| `registerNetworkByScheme`         | `POST /directory_entries`        | Same                                   |
| `unregisterNetwork`               | `DELETE /directory_entries/{id}` | Direct map                             |

### Identifiers (3 methods)

| Adapter Method             | Super PDP Endpoint               | Notes                                 |
| -------------------------- | -------------------------------- | ------------------------------------- |
| `createIdentifier`         | `POST /directory_entries`        | Directory entries contain identifiers |
| `createIdentifierByScheme` | `POST /directory_entries`        | Same                                  |
| `deleteIdentifier`         | `DELETE /directory_entries/{id}` | Direct map                            |

### Claim Management (1 method)

| Adapter Method | Super PDP Endpoint | Notes                  |
| -------------- | ------------------ | ---------------------- |
| `deleteClaim`  | —                  | No claim concept. Stub |

## Coverage Summary

| Category           | Total  | Mapped | Stubbed | Coverage |
| ------------------ | ------ | ------ | ------- | -------- |
| Invoice Operations | 13     | 7      | 6       | 54%      |
| Directory          | 3      | 1      | 2       | 33%      |
| Status             | 4      | 2      | 2       | 50%      |
| Reporting          | 2      | 2      | 0       | 100%     |
| Webhooks           | 5      | 0      | 5       | 0%       |
| Operator Config    | 12     | 5      | 7       | 42%      |
| Identifiers        | 3      | 3      | 0       | 100%     |
| Claims             | 1      | 0      | 1       | 0%       |
| **Total**          | **43** | **20** | **23**  | **47%**  |

## Key Differences vs Iopole and Storecove

| Aspect            | Iopole                              | Storecove                 | Super PDP                                       |
| ----------------- | ----------------------------------- | ------------------------- | ----------------------------------------------- |
| Scope             | PDP France (B2B)                    | Peppol AP (international) | PA France (B2B)                                 |
| Auth              | OAuth2 client_credentials           | API key (Bearer)          | OAuth2 (client_credentials + authorizationCode) |
| Invoice search    | Lucene query                        | No search (webhook push)  | List with direction/date filters + cursor       |
| Format generation | Separate CII/UBL/Factur-X endpoints | Auto on submission        | Convert endpoint (any→any)                      |
| Status codes      | Iopole enum (IN_HAND, APPROVED…)    | Evidence-based            | French codes (fr:212…)                          |
| Directory         | General PPF + Peppol                | Peppol discovery          | Own company entries only                        |
| E-reporting       | Dedicated endpoints                 | Handled internally        | Via AFNOR flow API                              |
| Webhooks          | Full CRUD                           | Read + delete             | Not yet available                               |
| API maturity      | v1 stable                           | v2 stable                 | v1.beta                                         |

## Status Code Mapping (CDAR)

Super PDP uses French CDAR codes (`fr:205`, `fr:210`...). The viewers resolve
these via `getStatus()` which maps CDAR numeric → lifecycle key automatically.

| Super PDP code | CDAR | Lifecycle key      | Label FR          |
| -------------- | ---- | ------------------ | ----------------- |
| `fr:200`       | 200  | `submitted`        | Déposée           |
| `fr:205`       | 205  | `approved`         | Approuvée         |
| `fr:207`       | 207  | `disputed`         | En litige         |
| `fr:210`       | 210  | `refused`          | Refusée           |
| `fr:211`       | 211  | `payment_sent`     | Paiement transmis |
| `fr:212`       | 212  | `payment_received` | Encaissée         |
| `fr:213`       | 213  | `rejected`         | Rejetée           |

No adapter-side mapping needed — the viewer's `getStatus()` strips the `fr:`
prefix and resolves the numeric code.

## Environment Variables

```
SUPERPDP_API_URL=https://api.superpdp.tech/v1.beta
SUPERPDP_CLIENT_ID=<oauth2-client-id>
SUPERPDP_CLIENT_SECRET=<oauth2-client-secret>
# Token endpoint: https://api.superpdp.tech/oauth2/token
```
