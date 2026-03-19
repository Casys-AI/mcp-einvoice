# Adapters — PA-agnostic e-invoicing

Each PA (Plateforme Agréée / Access Point) has its own subdirectory with adapter, client, tests, and API specs.

## Architecture

```
EInvoiceAdapter (interface, 43 methods + capabilities)
├── AfnorBaseAdapter (abstract)          ← AFNOR XP Z12-013 socle
│   ├── IopoleAdapter (afnor=null)       ← all native overrides (passe-plat)
│   └── SuperPDPAdapter (afnor=active)   ← AFNOR + native extensions
└── StorecoveAdapter                     ← implements directly (Peppol, not French)
```

Shared: `afnor/client.ts` (AfnorClient), `shared/oauth2.ts` (OAuth2 token provider).

## Current Adapters

| Adapter | Directory | Base | Status |
|---------|-----------|------|--------|
| [Iopole](./iopole/) | `src/adapters/iopole/` | AfnorBaseAdapter | 39/39 tools, production-ready |
| [Storecove](./storecove/) | `src/adapters/storecove/` | EInvoiceAdapter | 21/39 tools, implemented |
| [Super PDP](./superpdp/) | `src/adapters/superpdp/` | AfnorBaseAdapter | 22/39 tools, implemented |

## Adding a New French PA Adapter

1. Create `src/adapters/<name>/`
2. Extend `AfnorBaseAdapter` from `../afnor/base-adapter.ts`
3. Override methods with native API when better than AFNOR default
4. Set `capabilities` to the methods you support
5. Add factory function: `export function create<Name>Adapter()`
6. Add HTTP client in `client.ts` (use `createOAuth2TokenProvider` from `../shared/oauth2.ts`)
7. Register in `src/adapters/mod.ts` and `server.ts`
8. Add API specs and `README.md`

## Adding a Non-French Adapter

1. Create `src/adapters/<name>/`
2. Implement `EInvoiceAdapter` interface directly
3. Follow same registration steps as above

## Status Codes (CDAR — PPF Lifecycle)

All adapters return status codes that the viewers resolve via `getStatus()` from
`src/ui/shared/status.ts`. The viewers accept any format:

- CDAR numeric: `"205"` → `approved`
- CDAR prefixed: `"fr:205"` → `approved`
- Iopole label: `"APPROVED"` → `approved`
- AFNOR ack: `"Ok"` → `delivered`

French PA adapters should use CDAR codes or Iopole-style labels.
Non-French adapters (Storecove) can return any code — unknown codes display as-is.

4 codes obligatoires PPF: **200** (Déposée), **210** (Refusée), **212** (Encaissée), **213** (Rejetée).

## Interface

`EInvoiceAdapter` from `src/adapter.ts` — 43 methods covering:
- Invoice operations (submit, search, get, download, generate)
- Status management (send, history)
- Directory search (French PPF, Peppol international)
- Operator config (entities, enrollment, network registration)
- Webhooks, reporting, identifiers, claims
