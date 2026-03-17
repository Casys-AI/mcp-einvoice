# Directory Card — Contract

## Purpose

Display a single business entity from the French PPF directory.
Read-only view — shows company identity, registration, and routing information.

## Inputs

MCP tool result from `einvoice_directory_fr_search` (single result drill-down):

```typescript
interface DirectoryData {
  businessEntityId: string;
  name: string;
  type: string;          // LEGAL_UNIT, OFFICE
  siren?: string;
  siret?: string;
  country?: string;
  identifiers?: Array<{
    scheme: string;
    value: string;
  }>;
  networks?: string[];   // registered platforms
}
```

## Outputs

None. This viewer is read-only.

## Visual Design

- Card layout with info grid (same as InvoiceViewer info cards)
- Entity type label (Entite juridique / Etablissement)
- SIREN/SIRET displayed with labels
- Networks/platforms listed if available

## Auto-refresh

- No auto-refresh timer
- Refreshes on tab focus/visibility change

## Invariants

- Entity type labels use French translations (LEGAL_UNIT → "Entite juridique")
- Empty state: "Aucune entreprise a afficher" with SVG illustration
- Country defaults to "FR" if absent
