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
