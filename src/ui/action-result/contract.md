# Action Result — Contract

## Purpose

Generic confirmation viewer for mutation tools. Shows success/error status,
action details, and an optional "next step" button.

Used by: enrollment, network registration, entity creation/deletion,
identifier management, claim operations, and any other state-changing tool.

## Inputs

```typescript
interface ActionResultData {
  action?: string;           // "Enrollment" | "Enregistrement réseau"
  status?: "success" | "error";
  title?: string;            // "Entité enrollée avec succès"
  message?: string;          // Longer explanation
  details?: Record<string, unknown>;  // Key-value pairs
  nextAction?: {
    label: string;           // "Émettre une facture"
    toolName: string;        // MCP tool to call
    arguments?: Record<string, unknown>;
  };
}
```

If the tool result doesn't have `action`/`status`/`title` fields,
the viewer wraps it as a success with the raw result as details.

## Outputs

Optional `nextAction` button calls the specified MCP tool via `app.callServerTool()`.

## Visual Design

- Large status icon (green checkmark / red cross) in circle
- Title in bold, action name in muted text below
- Optional message paragraph
- Details in info grid (same style as invoice-viewer InfoCard)
- Optional "next step" button with accent color

## Invariants

- No auto-refresh (confirmations are one-shot)
- Handles both shaped results (with action/status) and raw API responses
- Details keys starting with `_` are hidden
