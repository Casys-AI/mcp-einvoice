/**
 * E-Invoice Adapters Registry
 *
 * Each PA (Plateforme Agréée / PDP) has its own subdirectory:
 *   - iopole/     — Iopole (French PDP)
 *   - storecove/  — Storecove (future)
 *
 * @module lib/einvoice/src/adapters/mod
 */

export { createIopoleAdapter, IopoleAdapter } from "./iopole/adapter.ts";
export {
  createStorecoveAdapter,
  StorecoveAdapter,
} from "./storecove/adapter.ts";
export { createSuperPDPAdapter, SuperPDPAdapter } from "./superpdp/adapter.ts";
export {
  createChorusProAdapter,
  ChorusProAdapter,
} from "./choruspro/adapter.ts";
export { BaseAdapter } from "./base-adapter.ts";
export { AfnorBaseAdapter } from "./afnor/base-adapter.ts";
export { AfnorClient } from "./afnor/client.ts";
export { createAdapter, listAdapterNames } from "./registry.ts";
