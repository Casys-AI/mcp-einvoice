/**
 * Unified E-Invoice status registry + lifecycle transition guards.
 *
 * Single source of truth for status colors, labels, and valid transitions.
 * Used by all viewers (invoice, doclist, timeline).
 *
 * Sources: PA OpenAPI specs (docs/api-specs/)
 * - metadata.state: PENDING, VALID, DELIVERED, WRONG_ROUTING, etc.
 * - status.code: SUBMITTED, ISSUED, APPROVED, REFUSED, etc.
 */

import { colors } from "./theme";

export interface StatusScheme {
  color: string;
  bg: string;
  label: string;
}

/** Unified status registry — lowercase keys, covers both search state + lifecycle codes. */
export const STATUS_REGISTRY: Record<string, StatusScheme> = {
  // Internal (preview, not a PA status)
  "aperçu":            { color: colors.warning,     bg: colors.warningDim,   label: "Aperçu" },
  "apercu":            { color: colors.warning,     bg: colors.warningDim,   label: "Aperçu" },
  // Search state (metadata.state)
  pending:             { color: colors.text.muted,   bg: colors.bg.elevated,  label: "En attente" },
  processing:          { color: colors.info,         bg: colors.infoDim,      label: "En traitement" },
  valid:               { color: colors.success,      bg: colors.successDim,   label: "Valide" },
  invalid:             { color: colors.error,        bg: colors.errorDim,     label: "Invalide" },
  duplicated:          { color: colors.warning,      bg: colors.warningDim,   label: "Doublon" },
  wrong_routing:       { color: colors.error,        bg: colors.errorDim,     label: "Erreur routage" },
  delivered:           { color: colors.info,         bg: colors.infoDim,      label: "Livrée" },
  not_delivered:       { color: colors.error,        bg: colors.errorDim,     label: "Non livrée" },
  delivery_pending:    { color: colors.text.muted,   bg: colors.bg.elevated,  label: "Livraison en cours" },
  converted:           { color: colors.success,      bg: colors.successDim,   label: "Convertie" },
  conversion_failed:   { color: colors.error,        bg: colors.errorDim,     label: "Conversion échouée" },
  // Lifecycle status codes (status.code)
  submitted:           { color: colors.info,         bg: colors.infoDim,      label: "Soumise" },
  issued:              { color: colors.info,         bg: colors.infoDim,      label: "Émise" },
  received:            { color: colors.info,         bg: colors.infoDim,      label: "Reçue" },
  made_available:      { color: colors.info,         bg: colors.infoDim,      label: "Mise à disposition" },
  in_hand:             { color: colors.info,         bg: colors.infoDim,      label: "Prise en charge" },
  approved:            { color: colors.success,      bg: colors.successDim,   label: "Approuvée" },
  partially_approved:  { color: colors.warning,      bg: colors.warningDim,   label: "Partiellement approuvée" },
  completed:           { color: colors.success,      bg: colors.successDim,   label: "Complétée" },
  payment_sent:        { color: colors.success,      bg: colors.successDim,   label: "Paiement envoyé" },
  payment_received:    { color: colors.success,      bg: colors.successDim,   label: "Paiement reçu" },
  suspended:           { color: colors.warning,      bg: colors.warningDim,   label: "Suspendue" },
  disputed:            { color: colors.warning,      bg: colors.warningDim,   label: "Contestée" },
  refused:             { color: colors.error,        bg: colors.errorDim,     label: "Refusée" },
  rejected:            { color: colors.error,        bg: colors.errorDim,     label: "Rejetée" },
  cancelled:           { color: colors.text.faint,   bg: colors.bg.elevated,  label: "Annulée" },
  // Legacy
  deposited:           { color: colors.info,         bg: colors.infoDim,      label: "Déposée" },
};

/** Case-insensitive status lookup. Works with both UPPERCASE (timeline) and lowercase (invoice). */
export function getStatus(code: string): StatusScheme {
  return STATUS_REGISTRY[code.toLowerCase()] ?? { color: colors.text.muted, bg: colors.bg.elevated, label: code };
}

/** Get just the French label for a status code. */
export function getStatusLabel(code: string): string {
  return STATUS_REGISTRY[code.toLowerCase()]?.label ?? code;
}

// ── Lifecycle transition guards ──────────────────────────────────

export function canAcceptReject(status: string, direction: string): boolean {
  return direction === "received" && ["delivered", "in_hand", "disputed"].includes(status.toLowerCase());
}

export function canSendPayment(status: string, direction: string): boolean {
  return direction === "received" && ["approved", "partially_approved"].includes(status.toLowerCase());
}

export function canReceivePayment(status: string, direction: string): boolean {
  return direction === "sent" && ["approved", "partially_approved", "delivered"].includes(status.toLowerCase());
}
