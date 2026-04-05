# IopoleClient Migration + Viewer Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate IopoleClient to extend BaseHttpClient and fix hardcoded "mcp-iopole" references in viewers.

**Architecture:** IopoleClient (340 lines, standalone) becomes a BaseHttpClient subclass like Storecove/SuperPDP/AFNOR clients. Custom methods (getV11, postBinary, upload, postWithQuery) stay as Iopole-specific extensions. Viewer HTML titles and build script messages change "mcp-iopole" → "mcp-einvoice".

**Tech Stack:** Deno, TypeScript, Vite (viewer builds)

**Status:** ✅ COMPLETED — 3 commits: `5685442`, `e5627d8`, `5497c51`

### Execution Notes (deviations from original plan)

1. `this.config.baseUrl` used instead of `this.baseUrl` — BaseHttpClient stores config as `protected config`, not separate fields
2. `AdapterAPIError` takes 4 args `(adapter, message, status, body)`, not 5 — plan had wrong constructor call
3. `IopoleAPIError` removed from `mod.ts` exports (not caught anywhere in adapter.ts — safe removal)
4. `http-client.ts` was NOT modified — `config` was already `protected`, no accessor needed
5. `Accept: "application/json"` NOT included in `getAuthHeaders()` — BaseHttpClient.request() already sets it

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `packages/core/src/adapters/iopole/client.ts` | Extend BaseHttpClient, keep custom methods |
| Modify | `packages/core/src/adapters/iopole/client_test.ts` | Verify behavior preserved, error class updated |
| ~~Modify~~ | ~~`packages/core/src/adapters/shared/http-client.ts`~~ | ~~Add `postBinary()` to base~~ — NOT NEEDED, `config` already `protected` |
| Modify | `packages/core/mod.ts` | Remove `IopoleAPIError` export |
| Modify | `packages/mcp/src/ui/action-result/index.html` | Fix title |
| Modify | `packages/mcp/src/ui/directory-card/index.html` | Fix title |
| Modify | `packages/mcp/src/ui/invoice-viewer/index.html` | Fix title |
| Modify | `packages/mcp/src/ui/status-timeline/index.html` | Fix title |
| Modify | `packages/mcp/src/ui/build-all.mjs` | Fix log messages |

---

### Task 1: Override getAuthHeaders in new IopoleClient

**Files:**
- Modify: `packages/core/src/adapters/iopole/client.ts`
- Test: `packages/core/src/adapters/iopole/client_test.ts`

- [x] **Step 1: Write failing test — auth headers include customer-id**

Add to `client_test.ts`:

```typescript
Deno.test("IopoleClient extends BaseHttpClient — getAuthHeaders includes customer-id", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);
  try {
    const client = makeClient();
    await client.get("/invoice/search");
    assertEquals(captured.length, 1);
    assertEquals(captured[0].headers["authorization"], "Bearer test-token-123");
    assertEquals(captured[0].headers["customer-id"], TEST_CUSTOMER_ID);
    assertEquals(captured[0].headers["accept"], "application/json");
  } finally {
    restore();
  }
});
```

- [x] **Step 2: Run test to verify it passes with current code**

Run: `deno test packages/core/src/adapters/iopole/client_test.ts --filter "getAuthHeaders"`

Expected: PASS (existing behavior already sends these headers — this test locks it in before refactoring)

- [x] **Step 3: Rewrite IopoleClient to extend BaseHttpClient**

Replace the full `client.ts` with:

```typescript
/**
 * Iopole HTTP Client
 *
 * Extends BaseHttpClient with Iopole-specific auth (Bearer + customer-id)
 * and custom methods (getV11, postBinary, upload, postWithQuery).
 *
 * @module adapters/iopole/client
 */

import { BaseHttpClient } from "../shared/http-client.ts";
import type { BaseClientConfig } from "../shared/http-client.ts";
import { AdapterAPIError } from "../shared/errors.ts";

export interface IopoleClientConfig extends BaseClientConfig {
  customerId: string;
  getToken: () => Promise<string>;
}

export class IopoleClient extends BaseHttpClient {
  private customerId: string;
  private getToken: () => Promise<string>;

  constructor(config: IopoleClientConfig) {
    super("Iopole", { baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
    this.customerId = config.customerId;
    this.getToken = config.getToken;
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      "customer-id": this.customerId,
      Accept: "application/json",
    };
  }

  /**
   * GET on the v1.1 API (replaces /v1 boundary with /v1.1 in baseUrl).
   * Concurrent-safe: builds a one-off URL without mutating config.
   */
  async getV11<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<T> {
    const saved = this.baseUrl;
    try {
      this.baseUrl = this.baseUrl.replace(/\/v1\b/, "/v1.1");
      return await this.get<T>(path, query);
    } finally {
      this.baseUrl = saved;
    }
  }

  /**
   * POST that returns query params alongside a JSON body.
   * Used for endpoints that take both body + query (e.g. search with filters).
   */
  async postWithQuery<T = unknown>(
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<T> {
    return await this.request<T>("POST", path, { body, query });
  }

  /**
   * POST that returns binary data (e.g. PDF generation).
   * Uses 60s timeout (longer than the 30s default).
   */
  async postBinary(
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | undefined>,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const authHeaders = await this.getAuthHeaders();
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new AdapterAPIError(
          "Iopole", "POST", path, response.status, errBody,
        );
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ??
        "application/octet-stream";
      return { data, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Multipart file upload. Does NOT set Content-Type — fetch adds the
   * boundary automatically.
   */
  async upload<T = unknown>(
    path: string,
    file: Uint8Array,
    filename: string,
  ): Promise<T> {
    const authHeaders = await this.getAuthHeaders();
    const url = new URL(`${this.baseUrl}${path}`);
    const form = new FormData();
    form.append("file", new Blob([file as BlobPart]), filename);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs ?? 30_000,
    );
    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: authHeaders["Authorization"],
          "customer-id": this.customerId,
          Accept: "application/json",
        },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new AdapterAPIError(
          "Iopole", "POST", path, response.status, errBody,
        );
      }
      const ct = response.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        return await response.json() as T;
      }
      return await response.text() as unknown as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

Note: `this.baseUrl` and `this.timeoutMs` are `protected` fields from BaseHttpClient. If they're `private`, expose them via `protected get` accessors in BaseHttpClient first.

- [x] **Step 4: Verify BaseHttpClient exposes baseUrl for getV11**

Check `packages/core/src/adapters/shared/http-client.ts`. If `baseUrl` is private, change it to `protected`. Same for `timeoutMs`.

```typescript
// In BaseHttpClient class declaration, change:
private baseUrl: string;
// to:
protected baseUrl: string;
```

- [x] **Step 5: Remove IopoleAPIError — use AdapterAPIError everywhere**

Search for `IopoleAPIError` imports in `packages/core/src/adapters/iopole/` files. Update any catch blocks in `adapter.ts` that reference `IopoleAPIError` to use `AdapterAPIError`.

Note: If adapter.ts catches `IopoleAPIError` by type, update those catches to `AdapterAPIError`. Both have `.status` and `.message`, so the public API is compatible.

- [x] **Step 6: Run full IopoleClient test suite**

Run: `deno test packages/core/src/adapters/iopole/client_test.ts`

Expected: ALL PASS. If any test references `IopoleAPIError` in assertions, update to `AdapterAPIError`.

- [x] **Step 7: Run full Iopole adapter test suite**

Run: `deno test packages/core/src/adapters/iopole/adapter_test.ts`

Expected: ALL PASS. The adapter uses client methods whose signatures haven't changed.

- [x] **Step 8: Run full test suite**

Run: `deno task test`

Result: 441 passed, 0 failed.

- [x] **Step 9: Commit**

```bash
git add packages/core/src/adapters/iopole/client.ts packages/core/src/adapters/iopole/client_test.ts packages/core/src/adapters/shared/http-client.ts
git commit -m "refactor: migrate IopoleClient to extend BaseHttpClient

Iopole was the only adapter with a standalone HTTP client. Now all 4
clients (Iopole, Storecove, SuperPDP, AFNOR) extend BaseHttpClient.
Custom methods (getV11, postBinary, upload, postWithQuery) kept as
Iopole-specific extensions. IopoleAPIError replaced by AdapterAPIError."
```

---

### Task 2: Fix hardcoded "mcp-iopole" in viewer HTML titles

**Files:**
- Modify: `packages/mcp/src/ui/action-result/index.html`
- Modify: `packages/mcp/src/ui/directory-card/index.html`
- Modify: `packages/mcp/src/ui/invoice-viewer/index.html`
- Modify: `packages/mcp/src/ui/status-timeline/index.html`

- [x] **Step 1: Fix all 4 HTML titles**

In each file, replace:
```html
<title>Action Result - mcp-iopole</title>
```
with:
```html
<title>Action Result - mcp-einvoice</title>
```

Same pattern for each viewer (directory-card, invoice-viewer, status-timeline).

- [x] **Step 2: Commit**

Commit: `e5627d8`

---

### Task 3: Fix hardcoded "Iopole" in build script ✅

**Files:**
- Modify: `packages/mcp/src/ui/build-all.mjs`

- [x] **Step 1: Fix log messages**

Line 30 — change:
```javascript
console.log(`Building ${uis.length} Iopole UIs`);
```
to:
```javascript
console.log(`Building ${uis.length} einvoice UIs`);
```

Line 51 — change:
```javascript
console.log(`All ${uis.length} Iopole UIs built successfully!`);
```
to:
```javascript
console.log(`All ${uis.length} einvoice UIs built successfully!`);
```

- [x] **Step 2: Commit**

Included in commit `e5627d8`.

---

### Task 4: Rebuild viewers ✅

- [x] **Step 1: Install dependencies (if needed) and rebuild**

```bash
cd packages/mcp/src/ui && npm install && node build-all.mjs
```

Expected: `Building 6 einvoice UIs` then `All 6 einvoice UIs built successfully!`

- [x] **Step 2: Verify built files have correct titles**

Result: 0 occurrences of "mcp-iopole" in dist/.

- [x] **Step 3: Commit rebuilt dist**

Commit: `5497c51`

- [x] **Step 4: Run full test suite to verify nothing broke**

Result: 441 passed, 0 failed.
