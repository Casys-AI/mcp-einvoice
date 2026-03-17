# ADR 0001: Unified Action Button Pattern

Date: 2026-03-17
Status: Accepted

## Context

The invoice-viewer has two incompatible button paradigms:
- **Preview mode**: a full-width green "Deposer la facture" button (prominent, large padding, 600 weight)
- **All other modes**: small inline ActionButton components (subtle, 12px font, 6px padding)

This creates visual inconsistency and inverts the interaction hierarchy — the preview action looks more important than accept/reject/dispute, when in reality all are state transitions of equal weight.

## Options

### 1. Keep the dual paradigm

Pros:
- "Deposer" stands out as the primary CTA in preview
- No code changes

Cons:
- Inconsistent visual language
- Users learn two patterns for one concept
- After deposit, the UI abruptly changes to small buttons (jarring)

Assessment:
- consistency: low
- implementation cost: zero
- UX quality: poor

### 2. All buttons small (ActionButton)

Pros:
- One visual language
- Consistent across all invoice states
- Natural transition between states (button bar stays, contents change)
- Easy to add/remove buttons per state

Cons:
- "Deposer" loses visual prominence
- Preview might look like it has too many small options

Assessment:
- consistency: high
- implementation cost: low
- UX quality: good

### 3. All buttons large (full-width)

Pros:
- Touch-friendly
- Very clear CTAs

Cons:
- 4+ full-width buttons stack vertically (too much space)
- Doesn't match doclist/timeline patterns

Assessment:
- consistency: medium (within invoice-viewer but not across viewers)
- implementation cost: medium
- UX quality: medium

## Decision

**Option 2: All buttons use the ActionButton component.**

"Deposer" becomes `<ActionButton label="Deposer" variant="success" />` — same style as "Accepter", "Rejeter", etc. The variant color (green/red/blue) provides sufficient visual distinction.

The button bar always appears at the bottom, with contents changing based on:
- Preview: Deposer (success)
- Sent + non-terminal: Paiement recu (success) + Marquer lu + PDF
- Received + non-terminal: Accepter + Rejeter + Contester + Paiement envoye + Marquer lu + PDF
- Terminal: Marquer lu + PDF only

## Consequences

- Remove the special full-width button block (`isPreview` section, lines 408-440)
- Add "Deposer" as an ActionButton in the unified button bar
- Simplify `isPreview` / `hasId` logic
- After emit, update the invoice ID from the API response so action buttons appear
