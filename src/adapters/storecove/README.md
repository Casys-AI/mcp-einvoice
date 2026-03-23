# Storecove Adapter

Storecove is a Peppol-certified Access Point providing international e-invoicing
via a REST JSON API. Complementary to Iopole (French PDP / B2B) — proves
architecture PA-agnosticism.

## API Overview

- **Host**: `api.storecove.com`
- **Base path**: `/api/v2`
- **Auth**: Bearer token (API key)
- **Sandbox**: Free 30-day dev account, same API, test Peppol network
- **Spec**: `api-specs/openapi.json` (Swagger 2.0, 120 definitions)
- **Doc**: https://www.storecove.com/docs/

## Endpoint Inventory (active, non-deprecated)

### DocumentSubmissions (send invoices)

| Method | Path                                           | Description                                   |
| ------ | ---------------------------------------------- | --------------------------------------------- |
| POST   | `/document_submissions`                        | Submit a new document (invoice, credit note…) |
| GET    | `/document_submissions/{guid}/evidence/{type}` | Get submission evidence (proof of delivery)   |

Three submission modes:

- **JSON Pure**: structured JSON → Storecove generates compliant format
- **JSON Parsed**: UBL/CII input → Storecove re-generates
- **JSON Enveloped**: raw document sent as-is

### ReceivedDocuments (receive invoices)

| Method | Path                                      | Description                            |
| ------ | ----------------------------------------- | -------------------------------------- |
| POST   | `/legal_entities/{id}/received_documents` | Push a received document (for testing) |
| GET    | `/received_documents/{guid}/{format}`     | Retrieve a received document           |

Formats: `json`, `ubl`, `cii`, `original`

### Discovery (directory / participant lookup)

| Method | Path                     | Description                                             |
| ------ | ------------------------ | ------------------------------------------------------- |
| POST   | `/discovery/exists`      | Check if participant exists on any network              |
| POST   | `/discovery/receives`    | Check participant capabilities (document types)         |
| GET    | `/discovery/identifiers` | List country-specific identifier schemes [EXPERIMENTAL] |

### LegalEntities (business entities)

| Method | Path                   | Description               |
| ------ | ---------------------- | ------------------------- |
| POST   | `/legal_entities`      | Create a new legal entity |
| GET    | `/legal_entities/{id}` | Get legal entity details  |
| PATCH  | `/legal_entities/{id}` | Update legal entity       |
| DELETE | `/legal_entities/{id}` | Delete legal entity       |

### PeppolIdentifiers (network registration)

| Method | Path                                                                          | Description                |
| ------ | ----------------------------------------------------------------------------- | -------------------------- |
| POST   | `/legal_entities/{id}/peppol_identifiers`                                     | Register Peppol identifier |
| DELETE | `/legal_entities/{id}/peppol_identifiers/{superscheme}/{scheme}/{identifier}` | Unregister                 |

### AdditionalTaxIdentifiers (tax IDs beyond Peppol)

| Method | Path                                                   | Description |
| ------ | ------------------------------------------------------ | ----------- |
| POST   | `/legal_entities/{id}/additional_tax_identifiers`      | Create      |
| GET    | `/legal_entities/{id}/additional_tax_identifiers/{id}` | Get         |
| PATCH  | `/legal_entities/{id}/additional_tax_identifiers/{id}` | Update      |
| DELETE | `/legal_entities/{id}/additional_tax_identifiers/{id}` | Delete      |

### WebhookInstances

| Method | Path                        | Description    |
| ------ | --------------------------- | -------------- |
| GET    | `/webhook_instances/`       | List webhooks  |
| DELETE | `/webhook_instances/{guid}` | Delete webhook |

Webhook creation is done via the Storecove UI or onboarding flow (not via API).

### C5 Activation (Singapore IRAS — country-specific)

6 endpoints for email/redirect activation/deactivation/cancel. Not relevant to
French e-invoicing.

## Mapping: EInvoiceAdapter → Storecove API

### Invoice Operations (13 methods)

| Adapter Method      | Storecove Endpoint                        | Notes                                                                                         |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `emitInvoice`       | `POST /document_submissions`              | JSON Pure mode with invoice data                                                              |
| `searchInvoices`    | —                                         | No search API. Invoices arrive via webhook (push) or polling (pull). Stub: return unsupported |
| `getInvoice`        | `GET /received_documents/{guid}/json`     | Returns parsed invoice JSON                                                                   |
| `downloadInvoice`   | `GET /received_documents/{guid}/original` | Returns original document                                                                     |
| `downloadReadable`  | `GET /received_documents/{guid}/json`     | No PDF render; return JSON view                                                               |
| `getInvoiceFiles`   | —                                         | No concept of attached files list. Stub                                                       |
| `getAttachments`    | —                                         | Attachments embedded in document. Stub                                                        |
| `downloadFile`      | —                                         | No separate file download. Stub                                                               |
| `markInvoiceSeen`   | —                                         | No seen/unseen tracking via API. Stub                                                         |
| `getUnseenInvoices` | Webhook pull mode                         | Poll webhook FIFO queue for new docs                                                          |
| `generateCII`       | —                                         | Storecove auto-generates. No standalone generate. Stub                                        |
| `generateUBL`       | —                                         | Same. Stub                                                                                    |
| `generateFacturX`   | —                                         | Same. Stub                                                                                    |

### Directory (3 methods)

| Adapter Method           | Storecove Endpoint         | Notes                          |
| ------------------------ | -------------------------- | ------------------------------ |
| `searchDirectoryFr`      | `POST /discovery/exists`   | Search by SIRET/SIREN scheme   |
| `searchDirectoryInt`     | `POST /discovery/receives` | Full Peppol participant lookup |
| `checkPeppolParticipant` | `POST /discovery/exists`   | Direct match                   |

### Status (4 methods)

| Adapter Method      | Storecove Endpoint                                 | Notes                                            |
| ------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `sendStatus`        | —                                                  | Status managed by receiving AP, not sender. Stub |
| `getStatusHistory`  | `GET /document_submissions/{guid}/evidence/{type}` | Evidence = proof of delivery/rejection           |
| `getUnseenStatuses` | Webhook events                                     | Status changes arrive via webhook                |
| `markStatusSeen`    | —                                                  | No explicit seen tracking. Stub                  |

### Reporting (2 methods)

| Adapter Method             | Storecove Endpoint | Notes                                            |
| -------------------------- | ------------------ | ------------------------------------------------ |
| `reportInvoiceTransaction` | —                  | Storecove handles tax reporting internally. Stub |
| `reportTransaction`        | —                  | Same. Stub                                       |

### Webhooks (5 methods)

| Adapter Method  | Storecove Endpoint                 | Notes                                    |
| --------------- | ---------------------------------- | ---------------------------------------- |
| `listWebhooks`  | `GET /webhook_instances/`          | Returns configured webhooks              |
| `getWebhook`    | `GET /webhook_instances/`          | Filter from list (no get-by-id)          |
| `createWebhook` | —                                  | Created via UI/onboarding, not API. Stub |
| `updateWebhook` | —                                  | Not exposed in API. Stub                 |
| `deleteWebhook` | `DELETE /webhook_instances/{guid}` | Works                                    |

### Operator Config (12 methods)

| Adapter Method                    | Storecove Endpoint                           | Notes                                                       |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `getCustomerId`                   | —                                            | No customer concept. Return API account info. Stub          |
| `listBusinessEntities`            | —                                            | No list endpoint. Would need to track IDs locally. Stub     |
| `getBusinessEntity`               | `GET /legal_entities/{id}`                   | Direct map                                                  |
| `createLegalUnit`                 | `POST /legal_entities`                       | Direct map                                                  |
| `createOffice`                    | —                                            | No office concept. Stub                                     |
| `deleteBusinessEntity`            | `DELETE /legal_entities/{id}`                | Direct map                                                  |
| `configureBusinessEntity`         | `PATCH /legal_entities/{id}`                 | Direct map                                                  |
| `claimBusinessEntity`             | —                                            | No claim workflow. Stub                                     |
| `claimBusinessEntityByIdentifier` | —                                            | No claim workflow. Stub                                     |
| `enrollFrench`                    | —                                            | No French-specific enrollment. Use Peppol identifiers. Stub |
| `enrollInternational`             | `POST .../peppol_identifiers`                | Register Peppol ID = enroll internationally                 |
| `registerNetwork`                 | `POST .../peppol_identifiers`                | Direct map                                                  |
| `registerNetworkByScheme`         | `POST .../peppol_identifiers`                | Map scheme to Peppol superscheme                            |
| `unregisterNetwork`               | `DELETE .../peppol_identifiers/{s}/{s}/{id}` | Direct map                                                  |

### Identifiers (3 methods)

| Adapter Method             | Storecove Endpoint                                                                  | Notes                              |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| `createIdentifier`         | `POST .../peppol_identifiers` or `POST .../additional_tax_identifiers`              | Route by identifier type           |
| `createIdentifierByScheme` | Same                                                                                | Map scheme to appropriate endpoint |
| `deleteIdentifier`         | `DELETE .../peppol_identifiers/...` or `DELETE .../additional_tax_identifiers/{id}` | Route by type                      |

### Claim Management (1 method)

| Adapter Method | Storecove Endpoint | Notes                  |
| -------------- | ------------------ | ---------------------- |
| `deleteClaim`  | —                  | No claim concept. Stub |

## Coverage Summary

| Category           | Total  | Mapped | Stubbed | Coverage |
| ------------------ | ------ | ------ | ------- | -------- |
| Invoice Operations | 13     | 5      | 8       | 38%      |
| Directory          | 3      | 3      | 0       | 100%     |
| Status             | 4      | 2      | 2       | 50%      |
| Reporting          | 2      | 0      | 2       | 0%       |
| Webhooks           | 5      | 3      | 2       | 60%      |
| Operator Config    | 12     | 7      | 5       | 58%      |
| Identifiers        | 3      | 3      | 0       | 100%     |
| Claims             | 1      | 0      | 1       | 0%       |
| **Total**          | **43** | **23** | **20**  | **53%**  |

This is expected and healthy — it proves the adapter interface accommodates
platforms with different capability profiles. Stubbed methods should throw a
clear `NotSupportedError` explaining the Storecove alternative (e.g. "Storecove
auto-generates formats; use emitInvoice with JSON Pure mode instead").

## Key Differences vs Iopole

| Aspect            | Iopole                          | Storecove                          |
| ----------------- | ------------------------------- | ---------------------------------- |
| Scope             | French PDP (B2B)                | Peppol AP (international)          |
| Auth              | OAuth2 client_credentials       | API key (Bearer token)             |
| Invoice search    | Lucene query + server filters   | No search — webhook push/pull      |
| Format generation | CII, UBL, Factur-X endpoints    | Auto-generated on submission       |
| Status management | Explicit send/receive lifecycle | Evidence-based (proof of delivery) |
| Entity enrollment | French SIRET/SIREN + network    | Peppol identifier registration     |
| Reporting         | Explicit transaction reporting  | Handled internally by Storecove    |

## Environment Variables

```
STORECOVE_API_URL=https://api.storecove.com/api/v2  # or sandbox URL
STORECOVE_API_KEY=<bearer-token>
```
