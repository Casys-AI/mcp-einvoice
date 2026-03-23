/**
 * Shared adapter types.
 *
 * @module lib/einvoice/src/adapters/shared/types
 */

/**
 * Normalize function contract for adapter-specific input mapping.
 * Used by normalizeForIopole() and normalizeForSuperPDP().
 * New adapters should follow this signature for consistency.
 */
export type NormalizeFn = (
  input: Record<string, unknown>,
) => Record<string, unknown>;
