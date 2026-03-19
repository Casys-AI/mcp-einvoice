/**
 * Unified E-Invoice status registry + lifecycle transition guards.
 *
 * Single source of truth for status colors, labels, and valid transitions.
 * Used by all viewers (invoice, doclist, timeline).
 *
 * Based on CDAR codes (PPF lifecycle, XP Z12-012 / BR-FR-CDV-CL-06):
 *   200 DÉPOSÉE, 201 ÉMISE, 202 REÇUE, 203 MISE À DISPOSITION,
 *   204 PRISE EN CHARGE, 205 APPROUVÉE, 206 APPROUVÉE PARTIELLEMENT,
 *   207 EN LITIGE, 208 SUSPENDUE, 209 COMPLÉTÉE, 210 REFUSÉE,
 *   211 PAIEMENT TRANSMIS, 212 ENCAISSÉE, 213 REJETÉE
 *
 * 4 codes obligatoires PPF: 200, 210, 212, 213
 *
 * Adapter-agnostic: accepts CDAR codes (200, fr:200), Iopole labels
 * (APPROVED), or lowercase (approved).
 */

import { colors } from "./theme";

export interface StatusScheme {
  color: string;
  bg: string;
  label: string;
}

// ── Lifecycle statuses (CDAR codes) ─────────────────────────

const LIFECYCLE: Record<string, StatusScheme> = {
  // 200–204: Dépôt et routage
  submitted:           { color: colors.info,         bg: colors.infoDim,      label: "Déposée" },          // CDAR 200
  issued:              { color: colors.info,         bg: colors.infoDim,      label: "Émise" },             // CDAR 201
  received:            { color: colors.info,         bg: colors.infoDim,      label: "Reçue" },             // CDAR 202
  made_available:      { color: colors.info,         bg: colors.infoDim,      label: "Mise à disposition" },// CDAR 203
  in_hand:             { color: colors.info,         bg: colors.infoDim,      label: "Prise en charge" },   // CDAR 204
  // 205–213: Traitement métier
  approved:            { color: colors.success,      bg: colors.successDim,   label: "Approuvée" },         // CDAR 205
  partially_approved:  { color: colors.warning,      bg: colors.warningDim,   label: "Partiellement approuvée" }, // CDAR 206
  disputed:            { color: colors.warning,      bg: colors.warningDim,   label: "En litige" },         // CDAR 207
  suspended:           { color: colors.warning,      bg: colors.warningDim,   label: "Suspendue" },         // CDAR 208
  completed:           { color: colors.success,      bg: colors.successDim,   label: "Complétée" },         // CDAR 209
  refused:             { color: colors.error,        bg: colors.errorDim,     label: "Refusée" },           // CDAR 210
  payment_sent:        { color: colors.success,      bg: colors.successDim,   label: "Paiement transmis" }, // CDAR 211
  payment_received:    { color: colors.success,      bg: colors.successDim,   label: "Encaissée" },         // CDAR 212
  rejected:            { color: colors.error,        bg: colors.errorDim,     label: "Rejetée" },           // CDAR 213
  cancelled:           { color: colors.text.faint,   bg: colors.bg.elevated,  label: "Annulée" },
};

// ── Platform state (technical, pre-lifecycle) ───────────────

const PLATFORM_STATE: Record<string, StatusScheme> = {
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
};

// ── Internal ────────────────────────────────────────────────

const INTERNAL: Record<string, StatusScheme> = {
  "aperçu":            { color: colors.warning,     bg: colors.warningDim,   label: "Aperçu" },
  "apercu":            { color: colors.warning,     bg: colors.warningDim,   label: "Aperçu" },
};

// ── CDAR numeric code → lifecycle key mapping ───────────────

const CDAR_MAP: Record<string, string> = {
  "200": "submitted",
  "201": "issued",
  "202": "received",
  "203": "made_available",
  "204": "in_hand",
  "205": "approved",
  "206": "partially_approved",
  "207": "disputed",
  "208": "suspended",
  "209": "completed",
  "210": "refused",
  "211": "payment_sent",
  "212": "payment_received",
  "213": "rejected",
};

// ── Legacy aliases ──────────────────────────────────────────

const ALIASES: Record<string, string> = {
  deposited: "submitted",          // Iopole legacy
  "ok": "delivered",               // AFNOR FlowAckStatus
  "error": "rejected",             // AFNOR FlowAckStatus
};

// ── Combined registry ───────────────────────────────────────

export const STATUS_REGISTRY: Record<string, StatusScheme> = {
  ...LIFECYCLE,
  ...PLATFORM_STATE,
  ...INTERNAL,
};

/**
 * Resolve a status code to its display scheme.
 * Accepts: CDAR numeric ("205", "fr:205"), Iopole labels ("APPROVED"),
 * lowercase lifecycle keys ("approved"), or AFNOR ack ("Ok").
 */
export function getStatus(code: string): StatusScheme {
  const raw = code.replace(/^fr:/i, "").trim();
  const key = raw.toLowerCase();

  // Direct match
  if (STATUS_REGISTRY[key]) return STATUS_REGISTRY[key];

  // CDAR numeric code
  if (CDAR_MAP[raw]) return STATUS_REGISTRY[CDAR_MAP[raw]];

  // Legacy alias
  if (ALIASES[key] && STATUS_REGISTRY[ALIASES[key]]) return STATUS_REGISTRY[ALIASES[key]];

  // Unknown
  return { color: colors.text.muted, bg: colors.bg.elevated, label: code };
}

/** Get just the French label for a status code. */
export function getStatusLabel(code: string): string {
  return getStatus(code).label;
}

/**
 * Normalize a status code to its canonical lifecycle key.
 * Used by adapters to normalize native codes before returning StatusEntry.
 *
 * "205" → "approved", "fr:210" → "refused", "APPROVED" → "approved",
 * "Ok" → "delivered", "deposited" → "submitted"
 */
export function normalizeStatusCode(code: string): string {
  const raw = code.replace(/^fr:/i, "").trim();
  const key = raw.toLowerCase();

  // CDAR numeric → lifecycle key
  if (CDAR_MAP[raw]) return CDAR_MAP[raw];

  // Known lifecycle key
  if (LIFECYCLE[key]) return key;

  // Legacy alias
  if (ALIASES[key]) return ALIASES[key];

  // Platform state (pass through)
  if (PLATFORM_STATE[key]) return key;

  return key;
}

// ── Lifecycle transition guards ──────────────────────────────────

export function canAcceptReject(status: string, direction: string): boolean {
  const s = normalizeStatusCode(status);
  return direction === "received" && ["delivered", "in_hand", "disputed"].includes(s);
}

export function canSendPayment(status: string, direction: string): boolean {
  const s = normalizeStatusCode(status);
  return direction === "received" && ["approved", "partially_approved"].includes(s);
}

export function canReceivePayment(status: string, direction: string): boolean {
  const s = normalizeStatusCode(status);
  return direction === "sent" && ["approved", "partially_approved", "delivered"].includes(s);
}
