/**
 * Adapter Factory Registry
 *
 * Centralized adapter creation by name. The server calls
 * `createAdapter("iopole")` instead of importing each factory directly.
 *
 * @module lib/einvoice/src/adapters/registry
 */

import { createIopoleAdapter } from "./iopole/adapter.ts";
import { createStorecoveAdapter } from "./storecove/adapter.ts";
import { createSuperPDPAdapter } from "./superpdp/adapter.ts";
import type { EInvoiceAdapter } from "../adapter.ts";

const ADAPTER_FACTORIES: Record<string, () => EInvoiceAdapter> = {
  iopole: createIopoleAdapter,
  storecove: createStorecoveAdapter,
  superpdp: createSuperPDPAdapter,
};

/** Create an adapter by name. Reads credentials from env vars. */
export function createAdapter(name: string): EInvoiceAdapter {
  const factory = ADAPTER_FACTORIES[name.toLowerCase()];
  if (!factory) {
    throw new Error(
      `Unknown adapter "${name}". Available: ${
        Object.keys(ADAPTER_FACTORIES).join(", ")
      }`,
    );
  }
  return factory();
}

/** List available adapter names. */
export function listAdapterNames(): string[] {
  return Object.keys(ADAPTER_FACTORIES);
}
