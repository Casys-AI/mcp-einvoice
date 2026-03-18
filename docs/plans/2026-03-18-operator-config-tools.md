# Operator Configuration Tools — Implementation Plan

Date: 2026-03-18
Status: In Progress

## Context

The mcp-einvoice server currently has 35 tools covering invoicing, status, directory,
reporting, webhooks, and basic operator config. But the config layer is incomplete —
missing network registration, identifier management, and entity configuration.

Without network registration, emitted invoices get WRONG_ROUTING because the sender
entity isn't registered on the DOMESTIC_FR network.

## Full Iopole API Inventory

Source: Swagger at https://api.ppd.iopole.fr/v1/api/ (6 API definitions)

### 1. Operator Invoicing Api — COMPLETE
27 tools cover all endpoints: invoice CRUD, status, directory, generate (CII/UBL/FacturX).

### 2. Operator Configuration Api — PARTIALLY IMPLEMENTED
8 tools implemented. Missing endpoints listed below.

### 3. Operator Reporting Api — COMPLETE
2 tools cover both endpoints. No read-back/list endpoint exists in the API.

### 4. Operator EDI Api — NOT IMPLEMENTED (DEFERRED)
3 endpoints for EDI document exchange (orders, delivery advice, etc.).
- POST /v1/edi/message/{messageType} — send EDI message
- GET /v1/edi/message/{messageId}/download — download message
- GET /v1/edi/message/{messageId}/download/all — download archive ZIP

**Decision**: Defer. EDI is a separate use case from e-invoicing. Most users of
mcp-einvoice won't need EDI. Implement when a specific need arises.

### 5. Platform Api — SKIPPED
Mirror of Invoicing + EDI APIs for platform-level integrations (PPF/PDP).
Endpoints: POST /invoice, POST /invoice/status, POST /edi/message.

**Decision**: Skip. This API is for platform integrators, not operators.
Our tools already cover these operations through the Operator Invoicing Api.

### 6. Stats Api — SKIPPED (for now)
7 endpoints for system monitoring: lastErrors, summary, messagesReceived,
messagesSent, messagesError, tagsDistribution, successErrors.
Parameters: network (EDI|INVOICE), interval (hour|day|week|month|year|all_time).

**Decision**: Skip for user-facing tools. This is DevOps monitoring data
(message counters, error rates, tag distribution), not business metrics.
A comptable doesn't need messagesError/threeMonths. If business stats are
needed later, they should come from aggregating invoice search data, not
from the Stats API. Could be useful for a future ops dashboard but not
for the MCP Apps UX.

## Missing Config Endpoints (Priority)

### P0 — Network Registration (causes WRONG_ROUTING)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/config/business/entity/identifier/{id}/network/{network}` | POST | Register identifier on a network (DOMESTIC_FR, PEPPOL_INTERNATIONAL) |
| `/v1/config/business/entity/identifier/scheme/{s}/value/{v}/network/{n}` | POST | Register by scheme/value |
| `/v1/config/business/entity/identifier/directory/{directoryId}` | DELETE | Unregister from network |

These are critical — an entity can exist in the operator's directory but
still get WRONG_ROUTING if it's not registered on DOMESTIC_FR.

### P1 — Identifier Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/config/business/entity/{id}/identifier` | POST | Create new identifier for entity |
| `/v1/config/business/entity/scheme/{s}/value/{v}/identifier` | POST | Create identifier by scheme/value |
| `/v1/config/business/entity/identifier/{id}` | DELETE | Remove identifier |

### P1 — Entity Configuration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/config/business/entity/{id}/configure` | POST | Configure entity (VAT regime) |

### P2 — Claim Management (extended)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/config/business/entity/{id}/claim` | DELETE | Remove operator association |

### P3 — Batch Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/config/business/entity/batch` | POST | Batch update (not production-ready per Iopole) |

## New Viewer: action-result

A generic confirmation viewer for all mutation tools (create, delete, enroll,
register, configure). Currently mutations return text-only — the LLM reformulates.

### Shape

```typescript
interface ActionResultData {
  action: string;           // "Enrollment" | "Création" | "Enregistrement réseau"
  status: "success" | "error";
  title: string;            // "Entité enrollée avec succès"
  details?: Record<string, string>;  // key-value details
  nextAction?: {            // "next step" button
    label: string;          // "Émettre une facture"
    toolName: string;       // "einvoice_invoice_generate_facturx"
    arguments?: Record<string, unknown>;
  };
}
```

### Viewer design
- Green/red icon based on status
- Title in bold
- Details as key-value grid (same as InfoCard from invoice-viewer)
- "Étape suivante" button that calls the suggested next tool
- Iopole branding header/footer

Used by: enrollment, network registration, entity creation, entity deletion,
identifier management, claim operations, retry strategy changes.

## Implementation Plan

### Phase 1 — Network registration + action-result viewer
- Add network registration methods to adapter interface
- Implement in Iopole adapter
- Create 3 new tools (register, register by scheme, unregister)
- Create action-result viewer
- Wire enrollment + registration tools to action-result viewer
- Test: register entity → emit invoice → verify DELIVERED

### Phase 2 — Identifiers + configure
- Add identifier CRUD methods to adapter
- Add configure method to adapter
- Create 4 new tools
- Wire to action-result viewer

### Phase 3 — action-result viewer for existing tools
- Wire existing mutation tools (enroll, claim, entity create/delete) to action-result
- Update webhook create/update/delete to use action-result

### Tool count projection
- Current: 35 tools (27 original + 8 config)
- Phase 1: +3 = 38
- Phase 2: +4 = 42
- Total with action-result wiring: 42 tools, 5 viewers

## Success Criteria

- Entity registered on DOMESTIC_FR network via MCP tool
- Invoice emit returns DELIVERED (not WRONG_ROUTING)
- Mutation tools show confirmation in action-result viewer
- User can set up a new entity end-to-end via conversation
