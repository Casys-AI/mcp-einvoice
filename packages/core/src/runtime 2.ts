/**
 * Runtime adapter — Deno implementation
 * @module einvoice-core/src/runtime
 */
export function env(key: string): string | undefined {
  return Deno.env.get(key);
}
