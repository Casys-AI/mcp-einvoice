# Adapters — PA-agnostic e-invoicing

Each PA (Plateforme Agréée / PDP) has its own subdirectory with adapter, client, tests, and API specs.

## Current Adapters

| Adapter | Directory | Status |
|---------|-----------|--------|
| [Iopole](./iopole/) | `src/adapters/iopole/` | 39 tools, production-ready |
| Storecove | `src/adapters/storecove/` | Planned |

## Adding a New Adapter

1. Create a subdirectory: `src/adapters/<name>/`
2. Implement `EInvoiceAdapter` interface from `../adapter.ts` in `adapter.ts`
3. Add a factory function: `export function create<Name>Adapter()`
4. Add HTTP client if needed: `client.ts`
5. Register in `src/adapters/mod.ts`
6. Add to `createAdapter()` switch in `server.ts`
7. Add API specs in `api-specs/` subdirectory
8. Add `README.md` with PA-specific docs (lifecycle, enums, sandbox behavior)

## Interface

All adapters implement `EInvoiceAdapter` from `src/adapter.ts`. The interface covers:
- Invoice operations (submit, search, get, download)
- Status management (send, history)
- Directory search (French PPF, Peppol international)
- Operator config (entities, enrollment, network registration)
- Webhooks, reporting
