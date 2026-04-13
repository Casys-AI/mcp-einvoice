/**
 * Shared direction normalization for all adapters.
 *
 * Maps PA-specific direction strings to the canonical "received" | "sent".
 * Covers: Iopole (RECEIVED/INBOUND/SENT/EMITTED/OUTBOUND),
 *         SUPER PDP (in/out), AFNOR (In/Out), Storecove (always received).
 *
 * @module lib/einvoice/src/adapters/shared/direction
 */

import type { InvoiceDirection } from "../../adapter.ts";

const RECEIVED = new Set(["received", "inbound", "in"]);
const SENT = new Set(["sent", "emitted", "outbound", "out"]);

/** Normalize any PA direction string to "received" | "sent" | undefined. */
export function normalizeDirection(
  raw: string | undefined,
): InvoiceDirection | undefined {
  if (!raw) return undefined;
  const l = raw.toLowerCase();
  if (RECEIVED.has(l)) return "received";
  if (SENT.has(l)) return "sent";
  return undefined;
}
