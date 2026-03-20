/**
 * E-Invoice Adapters Registry
 *
 * Each PA (Plateforme Agréée / PDP) has its own subdirectory:
 *   - iopole/     — Iopole (French PDP)
 *   - storecove/  — Storecove (future)
 *
 * @module lib/einvoice/src/adapters/mod
 */

export { IopoleAdapter, createIopoleAdapter } from "./iopole/adapter.ts";
export { StorecoveAdapter, createStorecoveAdapter } from "./storecove/adapter.ts";
export { SuperPDPAdapter, createSuperPDPAdapter } from "./superpdp/adapter.ts";
export { AfnorBaseAdapter } from "./afnor/base-adapter.ts";
export { AfnorClient } from "./afnor/client.ts";
export { createAdapter, listAdapterNames } from "./registry.ts";
