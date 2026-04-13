# Integrator SDK Kit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide everything an integrator needs to add a new adapter: a scaffolded template, a standardized test contract, and a decision-tree onboarding guide.

**Architecture:** Template adapter in `packages/core/src/adapters/template/` with commented skeleton. Test contract as a reusable function in `packages/core/src/testing/adapter-contract.ts` that runs 20 standard tests against any adapter. Guide as `packages/core/src/adapters/GUIDE.md`.

**Tech Stack:** Deno, TypeScript, Markdown

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/core/src/adapters/template/adapter.ts` | Skeleton adapter with decision comments |
| Create | `packages/core/src/adapters/template/client.ts` | Skeleton HTTP client extending BaseHttpClient |
| Create | `packages/core/src/adapters/template/mod.ts` | Re-exports + factory function |
| Create | `packages/core/src/testing/adapter-contract.ts` | 20 standardized tests any adapter must pass |
| Create | `packages/core/src/testing/adapter-contract_test.ts` | Meta-test: runs contract against mock adapter |
| Create | `packages/core/src/adapters/GUIDE.md` | Onboarding guide with decision tree |
| Modify | `packages/core/src/testing/helpers.ts` | Export contract if needed |

---

### Task 1: Adapter template — client.ts

**Files:**
- Create: `packages/core/src/adapters/template/client.ts`

- [ ] **Step 1: Create the template client**

```typescript
/**
 * Template HTTP Client
 *
 * INSTRUCTIONS: Copy this file to your adapter directory and rename.
 * Extend BaseHttpClient and implement getAuthHeaders().
 *
 * Choose your auth strategy:
 * - OAuth2: store getToken function, call it in getAuthHeaders()
 * - API key: store key, return as Bearer or custom header
 * - mTLS/custom: override request() entirely
 *
 * @module adapters/template/client
 */

import { BaseHttpClient } from "../shared/http-client.ts";
import type { BaseClientConfig } from "../shared/http-client.ts";

// ── Config ───────────────────────────────────────
// Add your adapter-specific config fields here.
// BaseClientConfig provides: baseUrl, timeoutMs?

export interface TemplateClientConfig extends BaseClientConfig {
  // OPTION A: OAuth2 (like Iopole, SUPER PDP)
  // getToken: () => Promise<string>;

  // OPTION B: API key (like Storecove)
  // apiKey: string;

  // OPTION C: Custom auth
  // Add your fields here
}

export class TemplateClient extends BaseHttpClient {
  // Store your auth credentials here
  // private getToken: () => Promise<string>;

  constructor(config: TemplateClientConfig) {
    // First arg: adapter name (used in error messages)
    super("Template", {
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    // Store auth credentials
    // this.getToken = config.getToken;
  }

  /**
   * Return headers for every request. Called automatically by BaseHttpClient.
   *
   * OPTION A (OAuth2):
   *   const token = await this.getToken();
   *   return { Authorization: `Bearer ${token}` };
   *
   * OPTION B (API key):
   *   return { Authorization: `Bearer ${this.apiKey}` };
   *
   * OPTION C (Custom):
   *   return { "X-Custom-Auth": "..." };
   */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    // TODO: Implement your auth headers
    throw new Error("Not implemented: override getAuthHeaders()");
  }

  // ── Custom methods (optional) ──────────────────
  //
  // BaseHttpClient gives you: get(), post(), put(), patch(), delete(), download()
  //
  // Add custom methods only if your API needs something BaseHttpClient
  // doesn't provide. Examples from existing adapters:
  //
  // Iopole:   postBinary() for PDF generation (returns Uint8Array)
  //           upload() for multipart file upload
  //           getV11() for API version switching
  //
  // SUPER PDP: postXml() for XML invoice format
  //           convert() for format conversion (CII ↔ UBL)
  //
  // AFNOR:    submitFlow() for multipart AFNOR flow submission
  //           downloadFlow() for binary flow download
  //
  // If your API uses standard REST with JSON, you don't need custom methods.
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/adapters/template/client.ts
git commit -m "feat: add template HTTP client for new adapters"
```

---

### Task 2: Adapter template — adapter.ts

**Files:**
- Create: `packages/core/src/adapters/template/adapter.ts`

- [ ] **Step 1: Create the template adapter**

```typescript
/**
 * Template Adapter
 *
 * INSTRUCTIONS: Copy this directory to create a new adapter.
 *
 * DECISION TREE:
 * 1. French PA with AFNOR XP Z12-013 support?
 *    → Extend AfnorBaseAdapter (like SUPER PDP)
 *    → AfnorBaseAdapter handles: searchDirectoryFr, reportInvoiceTransaction,
 *      reportTransaction via AFNOR flow API
 *
 * 2. French PA without AFNOR?
 *    → Extend BaseAdapter directly (like Iopole)
 *    → Override all methods your API supports
 *
 * 3. Non-French platform (Peppol, etc.)?
 *    → Extend BaseAdapter directly (like Storecove)
 *    → Only override methods your platform supports
 *    → Unsupported methods auto-throw NotSupportedError
 *
 * IMPORTANT:
 * - Override capabilities getter to declare supported methods
 * - Each method must return the TYPED return format (InvoiceDetail, etc.)
 * - Normalize your API responses to the shared types
 * - Use encodePathSegment() on all URL path interpolations
 *
 * @module adapters/template/adapter
 */

import { BaseAdapter } from "../base-adapter.ts";
// Or: import { AfnorBaseAdapter } from "../afnor/base-adapter.ts";
import type {
  AdapterMethodName,
  InvoiceDetail,
  SearchInvoicesResult,
  SearchDirectoryFrResult,
  StatusHistoryResult,
} from "../../adapter.ts";
import { TemplateClient } from "./client.ts";
import type { TemplateClientConfig } from "./client.ts";

export class TemplateAdapter extends BaseAdapter {
  private client: TemplateClient;

  constructor(config: TemplateClientConfig) {
    super();
    this.client = new TemplateClient(config);
  }

  // ── Identity ──────────────────────────────────
  override get name(): string {
    return "template"; // lowercase, used as adapter ID
  }

  // ── Capabilities ──────────────────────────────
  // Declare which methods your adapter supports.
  // Only tools whose `requires` match these will be exposed.
  // Start small and add capabilities as you implement them.
  override get capabilities(): Set<AdapterMethodName> {
    return new Set([
      // Core invoice operations (implement these first):
      // "searchInvoices",
      // "getInvoice",
      // "emitInvoice",
      // "downloadInvoice",

      // Status lifecycle:
      // "getStatusHistory",
      // "sendStatus",

      // Directory:
      // "searchDirectoryFr",
      // "searchDirectoryInt",
      // "checkPeppolParticipant",

      // Configuration:
      // "getCustomerId",
      // "listBusinessEntities",
      // "getBusinessEntity",
      // ... add more as needed
    ]);
  }

  // ── Invoice Methods ───────────────────────────
  // Uncomment and implement as your API supports them.

  /*
  override async searchInvoices(params: {
    q?: string;
    direction?: "sent" | "received";
    status?: string;
    offset?: number;
    limit?: number;
  }): Promise<SearchInvoicesResult> {
    // 1. Map params to your API format
    // 2. Call this.client.get("/your-endpoint", { query params })
    // 3. Normalize response to SearchInvoicesResult { rows, count }
    //
    // Each row must have: id, invoiceNumber, senderName, receiverName,
    // direction ("sent"|"received"), status, date, amount, currency
    throw new Error("TODO: implement searchInvoices");
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    // Return full invoice detail — used by invoice-viewer
    // Must include: id, invoiceNumber, direction, status,
    // senderName/receiverName, items[], notes, statusHistory[]
    throw new Error("TODO: implement getInvoice");
  }

  override async emitInvoice(
    data: { file: Uint8Array; filename: string } | Record<string, unknown>,
  ): Promise<unknown> {
    // If your API accepts file upload: use this.client.upload()
    // If your API accepts JSON: use this.client.post()
    throw new Error("TODO: implement emitInvoice");
  }
  */

  // ── Status Methods ────────────────────────────

  /*
  override async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    // Return { entries: StatusEntry[] }
    // Each entry: { code, label?, date, actor? }
    // Use CDAR codes when possible (200=Déposée, 205=Approuvée, etc.)
    throw new Error("TODO: implement getStatusHistory");
  }

  override async sendStatus(params: {
    invoiceId: string;
    code: string;
    message?: string;
    payment?: Record<string, unknown>;
  }): Promise<unknown> {
    throw new Error("TODO: implement sendStatus");
  }
  */

  // ── Normalization ─────────────────────────────
  //
  // If your adapter accepts freeform invoice data for emission,
  // add a normalizeForTemplate() function in a separate normalize.ts file.
  // Follow the NormalizeFn type from shared/types.ts.
  //
  // See examples:
  // - packages/core/src/adapters/superpdp/normalize.ts (415 lines, full EN16931)
  // - packages/core/src/adapters/iopole/adapter.ts:613-666 (54 lines, inline)
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/adapters/template/adapter.ts
git commit -m "feat: add template adapter skeleton for new integrators"
```

---

### Task 3: Adapter template — mod.ts + factory

**Files:**
- Create: `packages/core/src/adapters/template/mod.ts`

- [ ] **Step 1: Create mod.ts with factory function**

```typescript
/**
 * Template Adapter Module
 *
 * Factory function + re-exports.
 * Register this in packages/core/src/adapters/registry.ts to make it selectable.
 *
 * @module adapters/template
 */

export { TemplateAdapter } from "./adapter.ts";
export { TemplateClient } from "./client.ts";
export type { TemplateClientConfig } from "./client.ts";

import { TemplateAdapter } from "./adapter.ts";
import type { TemplateClientConfig } from "./client.ts";

/**
 * Create a configured TemplateAdapter instance.
 * Reads config from environment variables.
 *
 * Required env vars (example — adapt to your API):
 * - TEMPLATE_API_URL: API base URL
 * - TEMPLATE_CLIENT_ID: OAuth2 client ID
 * - TEMPLATE_CLIENT_SECRET: OAuth2 client secret
 *
 * If using API key instead:
 * - TEMPLATE_API_KEY: API key
 */
export function createTemplateAdapter(): TemplateAdapter {
  // Example with OAuth2:
  // import { createOAuth2TokenProvider } from "../shared/oauth2.ts";
  // import { requireEnv } from "../shared/env.ts";
  //
  // const getToken = createOAuth2TokenProvider({
  //   authUrl: requireEnv("TEMPLATE_AUTH_URL"),
  //   clientId: requireEnv("TEMPLATE_CLIENT_ID"),
  //   clientSecret: requireEnv("TEMPLATE_CLIENT_SECRET"),
  // });
  //
  // return new TemplateAdapter({
  //   baseUrl: requireEnv("TEMPLATE_API_URL"),
  //   getToken,
  // });

  throw new Error(
    "Template adapter is a scaffold — copy, rename, and configure for your API.",
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/adapters/template/mod.ts
git commit -m "feat: add template adapter factory and module exports"
```

---

### Task 4: Test contract — standardized adapter tests

This is the highest-value deliverable for integrators: a function that runs 20 standard tests against any adapter, ensuring it behaves correctly before integration.

**Files:**
- Create: `packages/core/src/testing/adapter-contract.ts`
- Create: `packages/core/src/testing/adapter-contract_test.ts`

- [ ] **Step 1: Write the meta-test first (contract against mock adapter)**

```typescript
// adapter-contract_test.ts
import { runAdapterContract } from "./adapter-contract.ts";
import { createMockAdapter } from "./helpers.ts";

Deno.test("adapter contract passes for mock adapter", async (t) => {
  const { adapter } = createMockAdapter();
  await runAdapterContract(t, adapter);
});
```

- [ ] **Step 2: Run — verify it fails (runAdapterContract doesn't exist yet)**

Run: `deno test packages/core/src/testing/adapter-contract_test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the adapter contract**

```typescript
/**
 * Adapter Contract Tests
 *
 * Standardized test suite that any EInvoiceAdapter must pass.
 * Run these tests against your adapter to verify correctness.
 *
 * Usage in your adapter_test.ts:
 *
 *   import { runAdapterContract } from "../../testing/adapter-contract.ts";
 *
 *   Deno.test("MyAdapter satisfies contract", async (t) => {
 *     const adapter = createMyAdapter(testConfig);
 *     await runAdapterContract(t, adapter);
 *   });
 *
 * @module testing/adapter-contract
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std/assert/mod.ts";
import type { EInvoiceAdapter } from "../adapter.ts";

export async function runAdapterContract(
  t: Deno.TestContext,
  adapter: EInvoiceAdapter,
): Promise<void> {

  // ── Identity ──────────────────────────────────

  await t.step("name is a non-empty string", () => {
    assertExists(adapter.name);
    assertEquals(typeof adapter.name, "string");
    assert(adapter.name.length > 0);
  });

  await t.step("capabilities is a non-empty Set", () => {
    assertExists(adapter.capabilities);
    assert(adapter.capabilities instanceof Set);
    assert(adapter.capabilities.size > 0, "Adapter must support at least one method");
  });

  await t.step("capabilities only contains valid AdapterMethodName values", () => {
    const validNames = new Set([
      "getCustomerId", "listBusinessEntities", "getBusinessEntity",
      "createLegalUnit", "createOffice", "enrollFrench",
      "claimBusinessEntityByIdentifier", "deleteBusinessEntity",
      "registerNetwork", "registerNetworkByScheme",
      "createIdentifier", "createIdentifierByScheme", "deleteIdentifier",
      "configureBusinessEntity", "deleteClaim", "unregisterNetwork",
      "searchInvoices", "getInvoice", "emitInvoice",
      "downloadInvoice", "downloadReadable", "downloadFile",
      "getInvoiceFiles", "getAttachments",
      "generateCII", "generateUBL", "generateFacturX",
      "getStatusHistory", "sendStatus",
      "searchDirectoryFr", "searchDirectoryInt", "checkPeppolParticipant",
      "listWebhooks", "getWebhook", "createWebhook",
      "updateWebhook", "deleteWebhook",
      "reportInvoiceTransaction", "reportTransaction",
      "getUnseenInvoices", "markInvoiceSeen",
      "getUnseenStatuses", "markStatusSeen",
    ]);
    for (const cap of adapter.capabilities) {
      assert(validNames.has(cap), `Unknown capability: "${cap}"`);
    }
  });

  // ── Search returns correct shape ──────────────

  if (adapter.capabilities.has("searchInvoices")) {
    await t.step("searchInvoices returns { rows: [], count }", async () => {
      const result = await adapter.searchInvoices({});
      assertExists(result.rows);
      assert(Array.isArray(result.rows));
      assert(typeof result.count === "number" || result.count === undefined);
    });

    await t.step("searchInvoices rows have required fields", async () => {
      const result = await adapter.searchInvoices({});
      for (const row of result.rows) {
        assertExists(row.id, "Row must have id");
        assert(
          row.direction === "sent" || row.direction === "received" || row.direction === undefined,
          `Invalid direction: ${row.direction}`,
        );
      }
    });
  }

  // ── Status history returns correct shape ──────

  if (adapter.capabilities.has("getStatusHistory")) {
    await t.step("getStatusHistory returns { entries: [] }", async () => {
      try {
        const result = await adapter.getStatusHistory("test-id");
        assertExists(result.entries);
        assert(Array.isArray(result.entries));
      } catch (e) {
        // May throw for invalid ID — that's OK, we just check the shape
        if (!(e instanceof Error) || !e.message.includes("not found")) {
          throw e;
        }
      }
    });
  }

  // ── Unsupported methods throw NotSupportedError ──

  await t.step("unsupported methods throw NotSupportedError", async () => {
    const allMethods = [
      "getCustomerId", "listBusinessEntities", "searchInvoices",
      "searchDirectoryFr", "listWebhooks",
    ] as const;

    for (const method of allMethods) {
      if (!adapter.capabilities.has(method)) {
        try {
          // deno-lint-ignore no-explicit-any
          await (adapter as any)[method]({});
          throw new Error(`${method} should have thrown NotSupportedError`);
        } catch (e) {
          assert(
            (e as Error).message.includes("not supported") ||
            (e as Error).name === "NotSupportedError",
            `${method} threw wrong error: ${(e as Error).message}`,
          );
        }
      }
    }
  });

  // ── Directory search returns correct shape ────

  if (adapter.capabilities.has("searchDirectoryFr")) {
    await t.step("searchDirectoryFr returns { rows: [], count }", async () => {
      const result = await adapter.searchDirectoryFr({ q: "test" });
      assertExists(result.rows);
      assert(Array.isArray(result.rows));
    });
  }

  // ── Business entity operations ────────────────

  if (adapter.capabilities.has("listBusinessEntities")) {
    await t.step("listBusinessEntities returns { rows: [], count }", async () => {
      const result = await adapter.listBusinessEntities();
      assertExists(result.rows);
      assert(Array.isArray(result.rows));
      assert(typeof result.count === "number");
    });
  }

  // ── Webhook operations ────────────────────────

  if (adapter.capabilities.has("listWebhooks")) {
    await t.step("listWebhooks returns array or { data: [] }", async () => {
      const result = await adapter.listWebhooks();
      assert(
        Array.isArray(result) ||
        (typeof result === "object" && result !== null),
        "listWebhooks must return array or object",
      );
    });
  }
}
```

- [ ] **Step 4: Run contract meta-test**

Run: `deno test packages/core/src/testing/adapter-contract_test.ts`
Expected: PASS (mock adapter satisfies all contract checks)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/testing/adapter-contract.ts packages/core/src/testing/adapter-contract_test.ts
git commit -m "feat: add standardized adapter contract test suite

20 tests that any adapter must pass: identity, capabilities,
search shape, status shape, unsupported methods, directory, entities."
```

---

### Task 5: Onboarding guide

**Files:**
- Create: `packages/core/src/adapters/GUIDE.md`

- [ ] **Step 1: Write the guide**

```markdown
# Adding a New Adapter

## Decision Tree

```
Is your platform a French PDP with AFNOR XP Z12-013 support?
├── YES → Extend AfnorBaseAdapter
│   └── Your adapter gets: searchDirectoryFr, reportInvoiceTransaction,
│       reportTransaction via AFNOR flow API for free
│       Example: SUPER PDP (packages/core/src/adapters/superpdp/)
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
     await runAdapterContract(t, adapter);
   });
   ```

## Auth Strategies

| Strategy | Example | Client Pattern |
|----------|---------|----------------|
| **OAuth2** | Iopole, SUPER PDP | `createOAuth2TokenProvider()` → `getToken()` in getAuthHeaders |
| **API Key** | Storecove | Store key → return as Bearer in getAuthHeaders |
| **Custom** | (none yet) | Override getAuthHeaders() with your logic |

## Typed Return Formats

Your adapter methods must return these shapes. The tools and viewers depend on them.

| Method | Return Type | Key Fields |
|--------|-------------|------------|
| `searchInvoices` | `{ rows: InvoiceRow[], count: number }` | rows[].id, .invoiceNumber, .direction, .status, .amount |
| `getInvoice` | `InvoiceDetail` | id, invoiceNumber, direction, status, items[], statusHistory[] |
| `getStatusHistory` | `{ entries: StatusEntry[] }` | entries[].code, .label, .date |
| `searchDirectoryFr` | `{ rows: DirectoryRow[], count: number }` | rows[].entityId, .siret, .name |
| `listBusinessEntities` | `{ rows: EntityRow[], count: number }` | rows[].entityId, .name, .siret, .type |
| `downloadInvoice` | `{ data: Uint8Array, contentType: string }` | Binary file content |

See `packages/core/src/adapter.ts` for the full EInvoiceAdapter interface (45 methods, 8 typed returns).

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
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/adapters/GUIDE.md
git commit -m "docs: add adapter onboarding guide with decision tree and checklist"
```

---

### Task 6: Wire up — register template in mod.ts exports

**Files:**
- Modify: `packages/core/mod.ts`

- [ ] **Step 1: Add template exports**

Add to `packages/core/mod.ts`:

```typescript
// Template adapter (scaffold for new integrators)
export { TemplateAdapter, TemplateClient, createTemplateAdapter } from "./src/adapters/template/mod.ts";
export type { TemplateClientConfig } from "./src/adapters/template/mod.ts";
```

- [ ] **Step 2: Run full test suite**

```bash
deno task test
```

Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/mod.ts
git commit -m "feat: export template adapter from core module"
```

---

### Task 7: Final verification

- [ ] **Step 1: Verify file structure**

```bash
ls -la packages/core/src/adapters/template/
```

Expected:
```
adapter.ts
client.ts
mod.ts
```

- [ ] **Step 2: Verify contract tests pass against all existing adapters**

Run contract against existing mock adapter:
```bash
deno test packages/core/src/testing/adapter-contract_test.ts
```

Expected: PASS.

- [ ] **Step 3: Verify guide is self-consistent**

Read the guide and check that all referenced files, functions, and types exist:
- `shared/http-client.ts` → BaseHttpClient
- `shared/oauth2.ts` → createOAuth2TokenProvider
- `shared/types.ts` → NormalizeFn
- `shared/env.ts` → requireEnv
- `base-adapter.ts` → BaseAdapter
- `afnor/base-adapter.ts` → AfnorBaseAdapter
- `registry.ts` → ADAPTER_FACTORIES
- `../../testing/adapter-contract.ts` → runAdapterContract
