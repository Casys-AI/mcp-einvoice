/**
 * Shared env utilities for adapter factories.
 *
 * @module einvoice-core/src/adapters/shared/env
 */

/** Require an env var to be set, or throw with a descriptive message. */
export function requireEnv(
  adapter: string,
  name: string,
  hint: string,
): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`[${adapter}] ${name} is required. ${hint}`);
  }
  return value;
}
