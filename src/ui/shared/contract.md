# UI Shared — Contract

## Purpose

Shared utilities, theme, and components for all MCP Apps viewers.

## Exports

### theme.ts
- `colors` — CSS variable palette (light/dark mode)
- `fonts` — font stacks (sans, mono)
- `styles` — reusable style objects (card, badge, button, table)
- `formatCurrency(amount, currency)` — locale-aware currency formatting (fr-FR)

### IopoleBrand.tsx
- `IopoleBrandHeader` — teal header bar with "E-INVOICE - facturation electronique"
- `IopoleBrandFooter` — right-aligned "E-Invoice" watermark

### refresh.ts
- `canRequestUiRefresh(gate, options)` — visibility + throttle gate
- `resolveUiRefreshRequest(payload, fallback)` — extract refresh config
- `extractToolResultText(result)` — parse MCP tool result content
- `normalizeUiRefreshFailureMessage(cause)` — user-friendly error messages

## Invariants

- All viewers MUST use `IopoleBrandHeader` and `IopoleBrandFooter`
- All viewers MUST use `colors` from theme.ts (never hardcode colors)
- Status badge colors MUST be consistent across viewers
- `formatCurrency` MUST use fr-FR locale everywhere
