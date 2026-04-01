/**
 * Runtime adapter — Node.js implementation
 * @module einvoice-core/src/runtime
 */
import process from "node:process";
export function env(key: string): string | undefined {
  return process.env[key];
}
