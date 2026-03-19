# UI Shared — Contract

## Purpose

Shared utilities, theme, status registry, and components for all MCP Apps viewers.

## Exports

### theme.ts
- `colors` — CSS variable palette (light/dark mode)
- `fonts` — font stacks (sans, mono)
- `styles` — reusable style objects (card, badge, button, table)
- `formatCurrency(amount, currency)` — locale-aware currency formatting (fr-FR)
- `formatNumber(n)` — locale-aware number formatting (fr-FR)

### Brand.tsx
- `BrandHeader` — header bar with "E-INVOICE - facturation electronique"
- `BrandFooter` — right-aligned "E-Invoice" watermark

### status.ts
- `STATUS_REGISTRY` — unified status schemes (color, bg, label) for all statuses
- `getStatus(code)` — resolve any status code to its display scheme
- `getStatusLabel(code)` — get French label for a status code
- `normalizeStatusCode(code)` — normalize any code to canonical lifecycle key
- `canAcceptReject(status, direction)` — lifecycle transition guard
- `canSendPayment(status, direction)` — lifecycle transition guard
- `canReceivePayment(status, direction)` — lifecycle transition guard

### refresh.ts
- `canRequestUiRefresh(gate, options)` — visibility + throttle gate
- `resolveUiRefreshRequest(payload, fallback)` — extract refresh config
- `extractToolResultText(result)` — parse MCP tool result content
- `normalizeUiRefreshFailureMessage(cause)` — user-friendly error messages

## Status Codes — CDAR (PPF Lifecycle)

All viewers use the CDAR status codes defined by the PPF reform (XP Z12-012).
The `getStatus()` function accepts any format:

| Input format | Example | Resolves to |
|---|---|---|
| CDAR numeric | `"205"` | `approved` |
| CDAR prefixed | `"fr:205"` | `approved` |
| Iopole label | `"APPROVED"` | `approved` |
| Lowercase key | `"approved"` | `approved` |
| AFNOR ack | `"Ok"` | `delivered` |

### CDAR codes reference (4 obligatoires PPF en gras)

| Code | Clé | Label FR | Couleur |
|---|---|---|---|
| **200** | `submitted` | Déposée | info |
| 201 | `issued` | Émise | info |
| 202 | `received` | Reçue | info |
| 203 | `made_available` | Mise à disposition | info |
| 204 | `in_hand` | Prise en charge | info |
| 205 | `approved` | Approuvée | success |
| 206 | `partially_approved` | Partiellement approuvée | warning |
| 207 | `disputed` | En litige | warning |
| 208 | `suspended` | Suspendue | warning |
| 209 | `completed` | Complétée | success |
| **210** | `refused` | Refusée | error |
| 211 | `payment_sent` | Paiement transmis | success |
| **212** | `payment_received` | Encaissée | success |
| **213** | `rejected` | Rejetée | error |

## Invariants

- All viewers MUST use `BrandHeader` and `BrandFooter`
- All viewers MUST use `colors` from theme.ts (never hardcode colors)
- Status badges MUST use `getStatus(code)` — never hardcode status colors
- Status action buttons MUST use `canAcceptReject` / `canSendPayment` / `canReceivePayment`
- `formatCurrency` MUST use fr-FR locale everywhere
- Status codes MUST be resolved via `getStatus()` to handle all input formats
