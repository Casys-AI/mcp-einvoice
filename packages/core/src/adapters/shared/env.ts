/**
 * Shared env utilities for adapter factories.
 *
 * @module einvoice-core/src/adapters/shared/env
 */

import { env } from "../../runtime.ts";

/** Require an env var to be set, or throw with a descriptive message. */
export function requireEnv(
  adapter: string,
  name: string,
  hint: string,
): string {
  const value = env(name);
  if (!value) {
    throw new Error(`[${adapter}] ${name} is required. ${hint}`);
  }
  return value;
}
