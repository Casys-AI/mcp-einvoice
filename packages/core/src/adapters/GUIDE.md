# Adding a New Adapter — AI Agent Guide

## Prerequisites

Before starting, you MUST have:
- The target platform's API documentation (endpoints, auth, request/response schemas)
- Store the API docs in `packages/core/src/adapters/<name>/api-reference.md`

## Base Class Decision

```
French PDP with AFNOR XP Z12-013?
  YES → AfnorBaseAdapter  (example: superpdp/)
  NO  → BaseAdapter        (examples: iopole/, storecove/, choruspro/)
```

## Files to Create

All files go in `packages/core/src/adapters/<name>/`.
Copy from `template/` as starting point: `cp -r template/ <name>/`

### 1. `api-reference.md` — Store API documentation

Store the full API reference: endpoints, auth, request/response schemas, enums.
This is the source of truth for maintaining the adapter.

### 2. `client.ts` — HTTP Client

Extend `BaseHttpClient`. Implement `getAuthHeaders()`.

Auth strategies:
- **OAuth2**: inject `getToken: () => Promise<string>` from `createOAuth2TokenProvider()`
- **API key**: inject key string, return in header
- **Dual auth** (e.g. Chorus Pro): combine multiple headers in `getAuthHeaders()`
- **Custom**: override `getAuthHeaders()` with your logic

If `createOAuth2TokenProvider()` is missing a feature you need (e.g. `scope`),
extend `OAuth2Config` in `shared/oauth2.ts` with an optional field — do NOT duplicate the provider.

### 3. `adapter.ts` — Adapter + Factory

Contains the adapter class AND the `create<Name>Adapter()` factory function.

Required:
- `override get name()` → lowercase adapter ID (e.g. `"choruspro"`)
- `override get capabilities()` → Set of ONLY the methods you implement
- Override methods from BaseAdapter, return typed shapes (see below)
- Factory function at bottom: reads env vars via `requireEnv()` / `env()`

### 4. `README.md` — Adapter documentation

Config table (env vars), capabilities mapping, platform-specific notes.

## Files to Modify (ALL required — missing any will break the build)

### 5. `packages/core/src/adapters/registry.ts`

```ts
import { create<Name>Adapter } from "./<name>/adapter.ts";
// Add to ADAPTER_FACTORIES:
<name>: create<Name>Adapter,
```

### 6. `packages/core/src/adapters/mod.ts`

```ts
export { create<Name>Adapter, <Name>Adapter } from "./<name>/adapter.ts";
```

### 7. `packages/core/mod.ts` (CRITICAL — the package entry point)

Two additions needed:

```ts
// In the Adapters section:
export { create<Name>Adapter, <Name>Adapter } from "./src/adapters/<name>/adapter.ts";

// In the Adapter Clients section:
export { <Name>Client } from "./src/adapters/<name>/client.ts";
export type { <Name>ClientConfig } from "./src/adapters/<name>/client.ts";
```

### 8. `packages/mcp/server.ts`

Add import and case to the `createAdapter()` switch:

```ts
import { create<Name>Adapter } from "@casys/einvoice-core";
// In switch:
case "<name>":
  return create<Name>Adapter();
```

Update the error message's adapter list.

### 9. `.env.example`

Add a section with all required env vars:

```
# ===================
# <Name> — <auth type>
# ===================
<NAME>_API_URL=...
<NAME>_CLIENT_ID=...
```

Update the adapter list comment at top: `# Adapter to use (iopole | ... | <name>)`

### 10. `README.md` (project root)

Three places to update:
- Logo row in `<p align="center">` (put logo SVG in `docs/logos/<name>.svg`)
- Platform table (`## Plateformes supportées`)
- Sandbox section (`## Obtenir un compte sandbox`)

## Return Type Reference

Methods MUST return these exact shapes. Tools and viewers depend on them.

| Method | Return Type | Required Fields |
|--------|-------------|-----------------|
| `searchInvoices` | `SearchInvoicesResult` | `{ rows: InvoiceSearchRow[], count }` — rows need: id, direction |
| `getInvoice` | `InvoiceDetail` | id, invoiceNumber, direction, status |
| `emitInvoice` | `Record<string, unknown>` | any confirmation object |
| `downloadInvoice` | `DownloadResult` | `{ data: Uint8Array, contentType }` |
| `getStatusHistory` | `StatusHistoryResult` | `{ entries: StatusEntry[] }` — entries need: date, code |
| `sendStatus` | `Record<string, unknown>` | any confirmation object |
| `searchDirectoryFr` | `SearchDirectoryFrResult` | `{ rows: DirectoryFrRow[], count }` — rows need: entityId |
| `searchDirectoryInt` | `SearchDirectoryIntResult` | `{ rows: DirectoryIntRow[], count }` |
| `listBusinessEntities` | `ListBusinessEntitiesResult` | `{ rows: BusinessEntityRow[], count }` — rows need: entityId |
| `getBusinessEntity` | `Record<string, unknown>` | raw entity data |

Full interface: `packages/core/src/adapter.ts`

## Normalization Rules

- `direction` must be `"sent"` or `"received"` — use `normalizeDirection()` from `shared/direction.ts`
- `amount` must be `number`, not `string` — coerce with `Number()`
- `id` must be `string` — coerce with `String()`
- `date` should be ISO format when possible
- Use `encodePathSegment()` on all URL path interpolations
- Use `uint8ToBase64()` from `shared/encoding.ts` for base64 encoding

## Validation

After implementation, run these checks in order:

```bash
# 1. Type-check (catches missing exports, wrong types)
deno check packages/core/mod.ts packages/mcp/server.ts packages/rest/server.ts

# 2. Unit tests (catches regressions in other adapters)
deno task test

# 3. Verify tool filtering (no credentials needed)
deno eval '
import { <Name>Adapter } from "./packages/core/src/adapters/<name>/adapter.ts";
import { EInvoiceToolsClient } from "./packages/mcp/src/client.ts";
const adapter = new <Name>Adapter(/* mock config */);
const client = new EInvoiceToolsClient();
console.log(client.supportedTools(adapter).map(t => t.name));
'

# 4. Contract tests (requires sandbox credentials)
# Create adapter_test.ts with runAdapterContract()
```

## Common Mistakes

| Mistake | Symptom |
|---------|---------|
| Forgot `packages/core/mod.ts` | TS2305: Module has no exported member |
| Forgot `packages/mcp/server.ts` switch | Runtime error: Unknown adapter |
| `capabilities` lists methods not overridden | Runtime NotSupportedError when tool called |
| `capabilities` misses overridden methods | Tool not exposed to agent |
| Template `mod.ts` left in adapter dir | Dead file — real adapters don't use per-adapter mod.ts |
| OAuth2 scope not passed | Token request rejected by auth server |
