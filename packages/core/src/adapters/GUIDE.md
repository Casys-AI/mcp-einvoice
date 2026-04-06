# Adding a New Adapter

## Decision Tree

```
Is your platform a French PDP with AFNOR XP Z12-013 support?
├── YES → Extend AfnorBaseAdapter
│   └── Your adapter gets: searchDirectoryFr, reportInvoiceTransaction,
│       reportTransaction via AFNOR flow API for free
│       Example: SuperPDP (packages/core/src/adapters/superpdp/)
│
├── NO, French PA without AFNOR
│   └── Extend BaseAdapter directly
│       Override all methods your API supports
│       Example: Iopole (packages/core/src/adapters/iopole/)
│
└── NO, non-French platform
    └── Extend BaseAdapter directly
        Only override methods your platform supports
        Unsupported methods auto-throw NotSupportedError
        Example: Storecove (packages/core/src/adapters/storecove/)
```

## Quick Start

1. **Copy the template:**
   ```bash
   cp -r packages/core/src/adapters/template/ packages/core/src/adapters/YOUR_NAME/
   ```

2. **Choose your base class** (see decision tree above)

3. **Implement the HTTP client** (`client.ts`):
   - Extend `BaseHttpClient`
   - Implement `getAuthHeaders()` with your auth strategy
   - Add custom methods only if BaseHttpClient's REST methods aren't enough
   - OAuth2? Use `createOAuth2TokenProvider()` from `shared/oauth2.ts`

4. **Implement the adapter** (`adapter.ts`):
   - Set `name` (lowercase, used as adapter ID in env vars)
   - Set `capabilities` (only methods you actually implement)
   - Override methods from BaseAdapter
   - Each method must return the **typed return format** (see Types below)

5. **Add normalization** (if your adapter accepts freeform invoice data):
   - Create `normalize.ts` following the `NormalizeFn` type from `shared/types.ts`
   - Map intuitive field names to your API's format
   - See `superpdp/normalize.ts` for a full example

6. **Register your adapter:**
   - Add factory to `packages/core/src/adapters/registry.ts`
   - Add case to `packages/mcp/server.ts` createAdapter() switch

7. **Run the contract tests:**
   ```typescript
   import { runAdapterContract } from "../../testing/adapter-contract.ts";

   Deno.test("MyAdapter satisfies contract", async (t) => {
     const adapter = createMyAdapter(testConfig);
     await runAdapterContract(t, adapter, {
       testInvoiceId: "known-sandbox-invoice-id",
     });
   });
   ```

## Auth Strategies

| Strategy | Example | Client Pattern |
|----------|---------|----------------|
| **OAuth2** | Iopole, SuperPDP | `createOAuth2TokenProvider()` → `getToken()` in getAuthHeaders |
| **API Key** | Storecove | Store key → return as Bearer in getAuthHeaders |
| **Custom** | (none yet) | Override getAuthHeaders() with your logic |

## Typed Return Formats

Your adapter methods must return these shapes. The tools and viewers depend on them.

| Method | Return Type | Key Fields |
|--------|-------------|------------|
| `searchInvoices` | `{ rows: InvoiceSearchRow[], count: number }` | rows[].id, .invoiceNumber, .direction, .status, .amount |
| `getInvoice` | `InvoiceDetail` | id, invoiceNumber, direction, status, lines[], notes[] |
| `getStatusHistory` | `{ entries: StatusEntry[] }` | entries[].code, .label, .date |
| `searchDirectoryFr` | `{ rows: DirectoryFrRow[], count: number }` | rows[].entityId, .siret, .name |
| `listBusinessEntities` | `{ rows: BusinessEntityRow[], count: number }` | rows[].entityId, .name, .siret, .type |
| `downloadInvoice` | `{ data: Uint8Array, contentType: string }` | Binary file content |

See `packages/core/src/adapter.ts` for the full EInvoiceAdapter interface and all typed returns.

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `direction: "in"` instead of `"sent"` | Contract fails on direction enum | Use `normalizeDirection()` from `shared/direction.ts` |
| `{ results: [...] }` instead of `{ rows: [...] }` | Contract fails on missing `rows` | Follow the exact type names from `adapter.ts` |
| `amount` as string | Contract fails on `typeof amount` | Use `Number(rawAmount)` coercion |
| Missing `count` in paginated results | Contract fails on `typeof count` | Always include `count` alongside `rows` |
| `data` as string for downloads | Contract fails `instanceof Uint8Array` | Read response as `arrayBuffer()`, not `text()` |
| Interpolating user input in URLs | Security vulnerability | Use `encodePathSegment()` on all path segments |

## Normalization Guidelines

If your adapter's `emitInvoice` accepts freeform invoice data (not just file upload):

1. Create `normalize.ts` in your adapter directory
2. Export a function matching `NormalizeFn` from `shared/types.ts`
3. Map human-friendly field names to your API's format
4. Handle defaults (country, currency, tax category codes)
5. Validate French mandatory fields (BR-FR-05 notes, BR-FR-12 electronic address)

## Checklist

- [ ] `client.ts` extends BaseHttpClient with getAuthHeaders()
- [ ] `adapter.ts` extends BaseAdapter (or AfnorBaseAdapter)
- [ ] `name` returns lowercase adapter ID
- [ ] `capabilities` Set matches implemented methods exactly
- [ ] All implemented methods return typed shapes
- [ ] `encodePathSegment()` used on URL path interpolations
- [ ] Factory function created and registered
- [ ] Contract tests pass (`runAdapterContract`)
- [ ] Unit tests cover all implemented methods with `mockFetch()`
- [ ] E2E test file created (for sandbox API testing with real credentials)
