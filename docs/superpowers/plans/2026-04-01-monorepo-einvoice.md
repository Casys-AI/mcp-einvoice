# Monorepo einvoice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure mcp-einvoice into a Deno workspaces monorepo with 3 packages (einvoice-core, mcp-einvoice, einvoice-rest) and build a REST API for Dolibarr.

**Architecture:** Monorepo with `packages/core` (adapter layer), `packages/mcp` (MCP server), `packages/rest` (Hono REST API). Core has zero external dependencies. MCP imports core + @casys/mcp-server. REST imports core + Hono + Zod.

**Tech Stack:** Deno workspaces, TypeScript, Hono 4, @hono/zod-openapi, @hono/swagger-ui, Zod 3

**Spec:** `docs/superpowers/specs/2026-04-01-monorepo-einvoice-design.md`

---

## Part 1: Monorepo Restructure

### Task 1: Create monorepo skeleton

Create the workspace directory structure and all `deno.json` files.

**Files:**
- Create: `packages/core/deno.json`
- Create: `packages/mcp/deno.json`
- Create: `packages/rest/deno.json`
- Modify: `deno.json` (root — replace with workspace config)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/core/src
mkdir -p packages/mcp/src
mkdir -p packages/rest/src
```

- [ ] **Step 2: Write root deno.json**

Replace the current `deno.json` with the workspace root config. Save the current content — we'll split it into the sub-packages.

```json
{
  "workspaces": ["packages/core", "packages/mcp", "packages/rest"],
  "tasks": {
    "test": "deno test --allow-all packages/",
    "test:core": "deno test --allow-all packages/core/",
    "test:mcp": "deno test --allow-all packages/mcp/",
    "test:rest": "deno test --allow-all packages/rest/",
    "mcp:serve": "deno run --allow-all packages/mcp/server.ts --http --port=3015",
    "rest:serve": "deno run --allow-all packages/rest/server.ts --port=3016"
  },
  "lint": {
    "rules": {
      "exclude": [
        "require-await",
        "no-explicit-any",
        "no-unversioned-import",
        "no-import-prefix",
        "jsx-button-has-type",
        "ban-unused-ignore"
      ]
    },
    "exclude": ["packages/mcp/src/ui/dist/", "packages/mcp/src/ui/node_modules/", ".cov/"]
  }
}
```

- [ ] **Step 3: Write packages/core/deno.json**

```json
{
  "name": "@casys/einvoice-core",
  "version": "0.1.0",
  "description": "PA-agnostic e-invoicing adapter layer. Types, adapters (Iopole, Storecove, SUPER PDP), shared utils.",
  "exports": {
    ".": "./mod.ts"
  },
  "publish": {
    "include": [
      "mod.ts",
      "src/**/*.ts"
    ],
    "exclude": [
      "**/*_test.ts",
      "**/*.test.ts"
    ]
  }
}
```

- [ ] **Step 4: Write packages/mcp/deno.json**

```json
{
  "name": "@casys/mcp-einvoice",
  "version": "0.1.6",
  "description": "PA-agnostic MCP tools for e-invoicing.",
  "exports": {
    ".": "./mod.ts",
    "./server": "./server.ts"
  },
  "imports": {
    "@casys/einvoice-core": "jsr:@casys/einvoice-core@^0.1.0",
    "@casys/mcp-server": "jsr:@casys/mcp-server@^0.12.0",
    "~/": "./src/ui/"
  },
  "publish": {
    "include": [
      "mod.ts",
      "server.ts",
      "src/**/*.ts"
    ],
    "exclude": [
      "**/*_test.ts",
      "**/*.test.ts"
    ]
  },
  "tasks": {
    "serve": "deno run --allow-all server.ts --http --port=3015",
    "compile": "deno compile -A --output mcp-einvoice server.ts",
    "ui:build": "cd src/ui && node build-all.mjs",
    "inspect": "deno run --allow-all server.ts --inspect"
  }
}
```

- [ ] **Step 5: Write packages/rest/deno.json**

```json
{
  "name": "@casys/einvoice-rest",
  "version": "0.1.0",
  "description": "REST API for e-invoicing — Hono + Zod OpenAPI, consumes einvoice-core adapters.",
  "exports": {
    ".": "./server.ts"
  },
  "imports": {
    "@casys/einvoice-core": "jsr:@casys/einvoice-core@^0.1.0",
    "hono": "npm:hono@^4",
    "@hono/zod-openapi": "npm:@hono/zod-openapi@^0.18",
    "@hono/swagger-ui": "npm:@hono/swagger-ui@^0.5",
    "zod": "npm:zod@^3"
  },
  "tasks": {
    "serve": "deno run --allow-all server.ts --port=3016"
  },
  "publish": {
    "include": [
      "server.ts",
      "src/**/*.ts"
    ],
    "exclude": [
      "**/*_test.ts",
      "**/*.test.ts"
    ]
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add deno.json packages/
git commit -m "chore: create monorepo skeleton with 3 Deno workspaces"
```

---

### Task 2: Move core files (adapter layer)

Move the adapter interface, all adapter implementations, and shared utilities into `packages/core/`. Fix the `env.ts` import chain to remove the `runtime.ts` dependency.

**Files:**
- Move: `src/adapter.ts` → `packages/core/src/adapter.ts`
- Move: `src/adapters/` → `packages/core/src/adapters/` (entire directory)
- Move: `src/testing/helpers.ts` → `packages/core/src/testing/helpers.ts` (only `createMockAdapter` + `mockFetch`)
- Move: `src/e2e_test.ts` → `packages/core/src/e2e_test.ts`
- Move: `src/e2e_superpdp_test.ts` → `packages/core/src/e2e_superpdp_test.ts`
- Modify: `packages/core/src/adapters/shared/env.ts` (remove runtime.ts import)
- Create: `packages/core/mod.ts`

- [ ] **Step 1: Move adapter files with git mv**

```bash
git mv src/adapter.ts packages/core/src/adapter.ts
git mv src/adapters packages/core/src/adapters
mkdir -p packages/core/src/testing
git mv src/testing/helpers.ts packages/core/src/testing/helpers.ts
git mv src/e2e_test.ts packages/core/src/e2e_test.ts
git mv src/e2e_superpdp_test.ts packages/core/src/e2e_superpdp_test.ts
```

- [ ] **Step 2: Fix env.ts — remove runtime.ts dependency**

`packages/core/src/adapters/shared/env.ts` currently imports `env` from `../../runtime.ts`. Core doesn't need the runtime abstraction. Replace with direct `Deno.env.get()`.

Before:
```ts
import { env } from "../../runtime.ts";
```

After — replace entire file with:
```ts
/**
 * Shared env utilities for adapter factories.
 *
 * @module einvoice-core/src/adapters/shared/env
 */

/** Require an env var to be set, or throw with a descriptive message. */
export function requireEnv(
  adapter: string,
  name: string,
  hint: string,
): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`[${adapter}] ${name} is required. ${hint}`);
  }
  return value;
}
```

- [ ] **Step 3: Fix relative imports in shared/direction.ts**

`packages/core/src/adapters/shared/direction.ts` imports from `../../adapter.ts`. This path is still valid within core's structure — verify it resolves correctly:

```ts
// This import is: packages/core/src/adapters/shared/direction.ts
// Target:         packages/core/src/adapter.ts
// Path ../../adapter.ts — correct, no change needed.
```

Verify all other `shared/*.ts` files — `encoding.ts`, `errors.ts`, `http-client.ts`, `oauth2.ts`, `types.ts` — none import from outside `adapters/` except `env.ts` (already fixed) and `direction.ts` (path still valid).

- [ ] **Step 4: Create packages/core/mod.ts**

```ts
/**
 * E-Invoice Core
 *
 * PA-agnostic adapter layer for e-invoicing.
 * Types, adapters (Iopole, Storecove, SUPER PDP), shared utilities.
 *
 * @module @casys/einvoice-core
 */

// ─── Interface & Types ──────────────────────────────────────
export type {
  AdapterMethodName,
  BusinessEntityRow,
  CreateWebhookRequest,
  DirectoryFrRow,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  DownloadResult,
  EInvoiceAdapter,
  EmitInvoiceRequest,
  GenerateFacturXRequest,
  GenerateInvoiceRequest,
  InvoiceDetail,
  InvoiceDirection,
  InvoiceLineItem,
  InvoiceSearchFilters,
  InvoiceSearchRow,
  ListBusinessEntitiesResult,
  PaginatedRequest,
  SearchDirectoryFrResult,
  SearchInvoicesResult,
  SendStatusRequest,
  StatusEntry,
  StatusHistoryResult,
  UpdateWebhookRequest,
} from "./src/adapter.ts";

// ─── Adapters ───────────────────────────────────────────────
export { BaseAdapter } from "./src/adapters/base-adapter.ts";
export { createAdapter, listAdapterNames } from "./src/adapters/registry.ts";
export { createIopoleAdapter } from "./src/adapters/iopole/adapter.ts";
export { createStorecoveAdapter } from "./src/adapters/storecove/adapter.ts";
export { createSuperPDPAdapter } from "./src/adapters/superpdp/adapter.ts";

// ─── Errors ─────────────────────────────────────────────────
export {
  AdapterAPIError,
  NotSupportedError,
} from "./src/adapters/shared/errors.ts";

// ─── Shared Utilities ───────────────────────────────────────
export {
  BaseHttpClient,
  type BaseClientConfig,
} from "./src/adapters/shared/http-client.ts";
export {
  createOAuth2TokenProvider,
  type OAuth2Config,
} from "./src/adapters/shared/oauth2.ts";
export {
  encodePathSegment,
  uint8ToBase64,
} from "./src/adapters/shared/encoding.ts";
export { requireEnv } from "./src/adapters/shared/env.ts";
export { normalizeDirection } from "./src/adapters/shared/direction.ts";

// ─── Testing ────────────────────────────────────────────────
export {
  createMockAdapter,
  mockFetch,
  type CapturedRequest,
  type MockResponse,
} from "./src/testing/helpers.ts";
```

- [ ] **Step 5: Remove unwrapStructured from core helpers**

Edit `packages/core/src/testing/helpers.ts`: remove the `unwrapStructured()` function and its JSDoc. It's MCP-specific and will be recreated in `packages/mcp/`. Keep `mockFetch()` and `createMockAdapter()`.

Delete these lines (at the end of the file):
```ts
/**
 * Unwrap a StructuredToolResult: if the result has { content, structuredContent },
 * return structuredContent. Otherwise return the result as-is.
 * Useful in tests to access viewer data regardless of whether the tool uses structuredContent.
 */
export function unwrapStructured(result: unknown): Record<string, unknown> {
  const r = result as Record<string, unknown>;
  if (
    r && typeof r.content === "string" && r.structuredContent &&
    typeof r.structuredContent === "object"
  ) {
    return r.structuredContent as Record<string, unknown>;
  }
  return r;
}
```

- [ ] **Step 6: Fix core testing helpers import**

`packages/core/src/testing/helpers.ts` imports from `../adapter.ts`. Verify path is valid:
```ts
// File: packages/core/src/testing/helpers.ts
// Import: import type { ... } from "../adapter.ts";
// Resolves to: packages/core/src/adapter.ts — correct.
```

- [ ] **Step 7: Verify core compiles**

```bash
deno check packages/core/mod.ts
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract einvoice-core package from src/"
```

---

### Task 3: Move MCP files and update imports

Move MCP-specific files into `packages/mcp/` and update all imports to use `@casys/einvoice-core`.

**Files:**
- Move: `server.ts` → `packages/mcp/server.ts`
- Move: `mod.ts` → `packages/mcp/mod.ts`
- Move: `src/client.ts` → `packages/mcp/src/client.ts`
- Move: `src/client_test.ts` → `packages/mcp/src/client_test.ts`
- Move: `src/generated-store.ts` → `packages/mcp/src/generated-store.ts`
- Move: `src/runtime.ts` → `packages/mcp/src/runtime.ts`
- Move: `src/runtime.node.ts` → `packages/mcp/src/runtime.node.ts`
- Move: `src/tools/` → `packages/mcp/src/tools/`
- Move: `src/ui/` → `packages/mcp/src/ui/`
- Create: `packages/mcp/src/testing/helpers.ts` (unwrapStructured only)

- [ ] **Step 1: Move MCP files with git mv**

```bash
git mv server.ts packages/mcp/server.ts
git mv mod.ts packages/mcp/mod.ts
git mv src/client.ts packages/mcp/src/client.ts
git mv src/client_test.ts packages/mcp/src/client_test.ts
git mv src/generated-store.ts packages/mcp/src/generated-store.ts
git mv src/runtime.ts packages/mcp/src/runtime.ts
git mv src/runtime.node.ts packages/mcp/src/runtime.node.ts
git mv src/tools packages/mcp/src/tools
git mv src/ui packages/mcp/src/ui
```

- [ ] **Step 2: Create MCP testing helper (unwrapStructured)**

Create `packages/mcp/src/testing/helpers.ts`:

```ts
/**
 * MCP-specific test helpers.
 *
 * @module mcp-einvoice/src/testing/helpers
 */

// Re-export core test helpers for convenience
export { createMockAdapter, mockFetch } from "@casys/einvoice-core";

/**
 * Unwrap a StructuredToolResult: if the result has { content, structuredContent },
 * return structuredContent. Otherwise return the result as-is.
 * Useful in tests to access viewer data regardless of whether the tool uses structuredContent.
 */
export function unwrapStructured(result: unknown): Record<string, unknown> {
  const r = result as Record<string, unknown>;
  if (
    r && typeof r.content === "string" && r.structuredContent &&
    typeof r.structuredContent === "object"
  ) {
    return r.structuredContent as Record<string, unknown>;
  }
  return r;
}
```

- [ ] **Step 3: Update imports in server.ts**

In `packages/mcp/server.ts`, replace adapter imports:

Before:
```ts
import type { EInvoiceAdapter } from "./src/adapter.ts";
import { createIopoleAdapter } from "./src/adapters/iopole/adapter.ts";
import { createStorecoveAdapter } from "./src/adapters/storecove/adapter.ts";
import { createSuperPDPAdapter } from "./src/adapters/superpdp/adapter.ts";
```

After:
```ts
import type { EInvoiceAdapter } from "@casys/einvoice-core";
import {
  createIopoleAdapter,
  createStorecoveAdapter,
  createSuperPDPAdapter,
} from "@casys/einvoice-core";
```

- [ ] **Step 4: Update imports in src/client.ts**

In `packages/mcp/src/client.ts`, replace:

Before:
```ts
import type { EInvoiceAdapter } from "./adapter.ts";
```

After:
```ts
import type { EInvoiceAdapter } from "@casys/einvoice-core";
```

- [ ] **Step 5: Update imports in src/tools/types.ts**

In `packages/mcp/src/tools/types.ts`, replace:

Before:
```ts
import type { AdapterMethodName, EInvoiceAdapter } from "../adapter.ts";
```

After:
```ts
import type { AdapterMethodName, EInvoiceAdapter } from "@casys/einvoice-core";
```

- [ ] **Step 6: Update imports in all tool files**

For each file in `packages/mcp/src/tools/`: `invoice.ts`, `directory.ts`, `status.ts`, `reporting.ts`, `webhook.ts`, `config.ts`, `error-mapper.ts` — search for any imports from `../adapter.ts` or `../adapters/` and replace with `@casys/einvoice-core`.

Key replacements:
- `import { uint8ToBase64 } from "../adapters/shared/encoding.ts"` → `import { uint8ToBase64 } from "@casys/einvoice-core"`
- `import { NotSupportedError } from "../adapters/shared/errors.ts"` → `import { NotSupportedError } from "@casys/einvoice-core"`
- `import type { ... } from "../adapter.ts"` → `import type { ... } from "@casys/einvoice-core"`

- [ ] **Step 7: Update imports in all test files**

For each `*_test.ts` in `packages/mcp/src/tools/` and `packages/mcp/src/client_test.ts`:

Replace:
```ts
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";
```
With:
```ts
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";
```

This path now points to `packages/mcp/src/testing/helpers.ts` (created in Step 2), which re-exports from core. The import path is the same relative path — verify it resolves.

For tests that import directly from `../../testing/helpers.ts`, update to `../testing/helpers.ts` based on the new directory depth.

- [ ] **Step 8: Update mod.ts exports**

In `packages/mcp/mod.ts`, replace adapter imports with core re-exports:

Before:
```ts
export type { ... } from "./src/adapter.ts";
export { createIopoleAdapter, IopoleAdapter } from "./src/adapters/iopole/adapter.ts";
export { createOAuth2TokenProvider, IopoleAPIError, IopoleClient } from "./src/adapters/iopole/client.ts";
```

After:
```ts
// Re-export core types for backwards compatibility
export type {
  EInvoiceAdapter,
  CreateWebhookRequest,
  // ... all types
} from "@casys/einvoice-core";

export { createIopoleAdapter } from "@casys/einvoice-core";

// Tools registry
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/tools/mod.ts";

export type {
  EInvoiceTool,
  EInvoiceToolCategory,
  JSONSchema,
  MCPToolWireFormat,
} from "./src/tools/types.ts";
```

- [ ] **Step 9: Verify MCP compiles**

```bash
deno check packages/mcp/server.ts
deno check packages/mcp/mod.ts
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move MCP files to packages/mcp, import from @casys/einvoice-core"
```

---

### Task 4: Clean up root and verify all tests pass

Remove leftover files from root `src/`, ensure directory is clean, and run the full test suite.

**Files:**
- Delete: `src/` (should be empty after moves)
- Delete: root `mod.ts` (moved to packages/mcp/)

- [ ] **Step 1: Check for leftover files**

```bash
ls src/
```

If `src/api/` or any other directories remain, evaluate whether they belong in core or mcp and move accordingly. If empty or unused, delete.

- [ ] **Step 2: Remove empty src directory**

```bash
rm -rf src/
```

- [ ] **Step 3: Run all tests**

```bash
deno task test
```

Expected: all existing tests pass (adapter tests in core, tool tests in mcp). Fix any remaining import path issues.

- [ ] **Step 4: Run lint**

```bash
deno lint packages/
```

Expected: no lint errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: clean up root, all tests green on monorepo structure"
```

---

## Part 2: REST API (einvoice-rest)

### Task 5: Hono app skeleton + API key middleware

Set up the Hono application with OpenAPI, Swagger UI, health check, and bearer auth middleware.

**Files:**
- Create: `packages/rest/server.ts`
- Create: `packages/rest/src/app.ts`
- Create: `packages/rest/src/app_test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rest/src/app_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "./app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

describe("REST API app", () => {
  const { adapter } = createMockAdapter();
  const app = createApp(adapter, "test-api-key-123");

  describe("API key auth", () => {
    it("rejects requests without API key", async () => {
      const res = await app.request("/api/health");
      assertEquals(res.status, 401);
    });

    it("rejects requests with wrong API key", async () => {
      const res = await app.request("/api/health", {
        headers: { Authorization: "Bearer wrong-key" },
      });
      assertEquals(res.status, 401);
    });

    it("accepts requests with correct API key", async () => {
      const res = await app.request("/api/health", {
        headers: { Authorization: "Bearer test-api-key-123" },
      });
      assertEquals(res.status, 200);
    });
  });

  describe("utility endpoints", () => {
    it("serves OpenAPI spec at /openapi.json", async () => {
      const res = await app.request("/openapi.json");
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.openapi, "3.1.0");
    });

    it("serves Swagger UI at /docs", async () => {
      const res = await app.request("/docs");
      assertEquals(res.status, 200);
    });

    it("serves health check", async () => {
      const res = await app.request("/api/health", {
        headers: { Authorization: "Bearer test-api-key-123" },
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.status, "ok");
      assertEquals(body.adapter, "mock");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
deno test --allow-all packages/rest/src/app_test.ts
```

Expected: FAIL — `./app.ts` doesn't exist yet.

- [ ] **Step 3: Implement app.ts**

Create `packages/rest/src/app.ts`:

```ts
/**
 * Hono REST application for e-invoicing.
 *
 * Creates an OpenAPIHono app with:
 * - Bearer API key authentication on /api/*
 * - OpenAPI 3.1 spec at /openapi.json
 * - Swagger UI at /docs
 * - Health check at /api/health
 *
 * @module einvoice-rest/src/app
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { bearerAuth } from "hono/bearer-auth";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function createApp(
  adapter: EInvoiceAdapter,
  apiKey: string | null,
): OpenAPIHono {
  const app = new OpenAPIHono();

  // ─── Auth middleware ──────────────────────────────────
  if (apiKey) {
    app.use("/api/*", bearerAuth({ token: apiKey }));
  }

  // ─── Health check ─────────────────────────────────────
  app.get("/api/health", (c) => {
    return c.json({ status: "ok", adapter: adapter.name });
  });

  // ─── OpenAPI + Swagger ────────────────────────────────
  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "E-Invoice REST API",
      version: "0.1.0",
      description: "PA-agnostic REST API for e-invoicing. Wraps einvoice-core adapters.",
    },
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  return app;
}
```

- [ ] **Step 4: Implement server.ts**

Create `packages/rest/server.ts`:

```ts
/**
 * E-Invoice REST Server
 *
 * Entry point for the Hono REST API server.
 *
 * Usage:
 *   deno run --allow-all packages/rest/server.ts --port=3016
 *   EINVOICE_ADAPTER=iopole EINVOICE_REST_API_KEY=xxx deno run --allow-all packages/rest/server.ts
 *
 * @module einvoice-rest/server
 */

import { createAdapter } from "@casys/einvoice-core";
import { createApp } from "./src/app.ts";

const DEFAULT_PORT = 3016;

function main() {
  const args = Deno.args;

  // Adapter selection
  const adapterArg = args.find((a) => a.startsWith("--adapter="));
  const adapterName = adapterArg
    ? adapterArg.split("=")[1]
    : Deno.env.get("EINVOICE_ADAPTER") || "iopole";

  // Port
  const portArg = args.find((a) => a.startsWith("--port="));
  const port = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : parseInt(Deno.env.get("PORT") || String(DEFAULT_PORT), 10);

  // API key
  const noAuth = args.includes("--no-auth");
  const apiKey = noAuth ? null : (Deno.env.get("EINVOICE_REST_API_KEY") ?? null);
  if (!apiKey && !noAuth) {
    console.error(
      "[einvoice-rest] WARNING: No EINVOICE_REST_API_KEY set. Use --no-auth to disable auth explicitly.",
    );
  }

  const adapter = createAdapter(adapterName);
  const app = createApp(adapter, apiKey);

  console.error(
    `[einvoice-rest] Starting — adapter=${adapterName}, port=${port}, auth=${apiKey ? "enabled" : "disabled"}`,
  );

  Deno.serve({ port }, app.fetch);
}

main();
```

- [ ] **Step 5: Run test to verify it passes**

```bash
deno test --allow-all packages/rest/src/app_test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rest/
git commit -m "feat(rest): Hono app skeleton with API key auth, Swagger UI, health check"
```

---

### Task 6: Invoice routes

Implement the 13 invoice routes with tests.

**Files:**
- Create: `packages/rest/src/routes/invoices.ts`
- Create: `packages/rest/src/routes/invoices_test.ts`
- Modify: `packages/rest/src/app.ts` (mount routes)

- [ ] **Step 1: Write the failing test**

Create `packages/rest/src/routes/invoices_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

function authed(path: string, init?: RequestInit): [string, RequestInit] {
  return [path, {
    ...init,
    headers: { ...init?.headers, Authorization: "Bearer test-key" },
  }];
}

describe("Invoice routes", () => {
  const { adapter, calls } = createMockAdapter();
  const app = createApp(adapter, "test-key");

  it("GET /api/invoices — searchInvoices", async () => {
    const res = await app.request(...authed("/api/invoices?q=test&direction=sent"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.count, 0);
    assertEquals(body.rows, []);
    const call = calls.find((c) => c.method === "searchInvoices");
    assertEquals(call?.args[0], { q: "test", direction: "sent" });
  });

  it("GET /api/invoices/:id — getInvoice", async () => {
    const res = await app.request(...authed("/api/invoices/inv-123"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, "inv-123");
  });

  it("POST /api/invoices/:id/mark-seen — markInvoiceSeen", async () => {
    const res = await app.request(...authed("/api/invoices/inv-123/mark-seen", {
      method: "POST",
    }));
    assertEquals(res.status, 200);
  });

  it("GET /api/invoices/unseen — getUnseenInvoices", async () => {
    const res = await app.request(...authed("/api/invoices/unseen"));
    assertEquals(res.status, 200);
  });

  it("POST /api/invoices/generate/cii — generateCII", async () => {
    const res = await app.request(...authed("/api/invoices/generate/cii", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: { id: "1" }, flavor: "EN16931" }),
    }));
    assertEquals(res.status, 200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
deno test --allow-all packages/rest/src/routes/invoices_test.ts
```

Expected: FAIL — routes not implemented.

- [ ] **Step 3: Implement invoice routes**

Create `packages/rest/src/routes/invoices.ts`:

```ts
/**
 * Invoice REST routes.
 *
 * @module einvoice-rest/src/routes/invoices
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerInvoiceRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ── Search ───────────────────────────────────────────────
  const searchRoute = createRoute({
    method: "get",
    path: "/api/invoices",
    tags: ["Invoices"],
    request: {
      query: z.object({
        q: z.string().optional().openapi({ description: "Search query" }),
        direction: z.enum(["sent", "received"]).optional(),
        status: z.string().optional(),
        offset: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
    },
    responses: {
      200: { description: "Invoice search results" },
    },
  });
  app.openapi(searchRoute, async (c) => {
    const { q, direction, status, offset, limit } = c.req.valid("query");
    const result = await adapter.searchInvoices({
      q, direction, status, offset, limit,
    });
    return c.json(result, 200);
  });

  // ── Get by ID ────────────────────────────────────────────
  const getRoute = createRoute({
    method: "get",
    path: "/api/invoices/{id}",
    tags: ["Invoices"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Invoice detail" } },
  });
  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getInvoice(id);
    return c.json(result, 200);
  });

  // ── Download ─────────────────────────────────────────────
  const downloadRoute = createRoute({
    method: "get",
    path: "/api/invoices/{id}/download",
    tags: ["Invoices"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Invoice file (binary)" } },
  });
  app.openapi(downloadRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { data, contentType } = await adapter.downloadInvoice(id);
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  });

  // ── Download Readable ────────────────────────────────────
  const readableRoute = createRoute({
    method: "get",
    path: "/api/invoices/{id}/readable",
    tags: ["Invoices"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Readable PDF" } },
  });
  app.openapi(readableRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { data, contentType } = await adapter.downloadReadable(id);
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  });

  // ── Files ────────────────────────────────────────────────
  const filesRoute = createRoute({
    method: "get",
    path: "/api/invoices/{id}/files",
    tags: ["Invoices"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Invoice files list" } },
  });
  app.openapi(filesRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getInvoiceFiles(id);
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Attachments ──────────────────────────────────────────
  const attachmentsRoute = createRoute({
    method: "get",
    path: "/api/invoices/{id}/attachments",
    tags: ["Invoices"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Invoice attachments" } },
  });
  app.openapi(attachmentsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getAttachments(id);
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Download File ────────────────────────────────────────
  const downloadFileRoute = createRoute({
    method: "get",
    path: "/api/files/{fileId}/download",
    tags: ["Invoices"],
    request: {
      params: z.object({ fileId: z.string().openapi({ param: { name: "fileId", in: "path" } }) }),
    },
    responses: { 200: { description: "File download (binary)" } },
  });
  app.openapi(downloadFileRoute, async (c) => {
    const { fileId } = c.req.valid("param");
    const { data, contentType } = await adapter.downloadFile(fileId);
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  });

  // ── Mark Seen ────────────────────────────────────────────
  const markSeenRoute = createRoute({
    method: "post",
    path: "/api/invoices/{id}/mark-seen",
    tags: ["Invoices"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Marked as seen" } },
  });
  app.openapi(markSeenRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.markInvoiceSeen(id);
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Unseen Invoices ──────────────────────────────────────
  const unseenRoute = createRoute({
    method: "get",
    path: "/api/invoices/unseen",
    tags: ["Invoices"],
    request: {
      query: z.object({
        offset: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
    },
    responses: { 200: { description: "Unseen invoices" } },
  });
  app.openapi(unseenRoute, async (c) => {
    const { offset, limit } = c.req.valid("query");
    const result = await adapter.getUnseenInvoices({ offset, limit });
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Emit ─────────────────────────────────────────────────
  const emitRoute = createRoute({
    method: "post",
    path: "/api/invoices/emit",
    tags: ["Invoices"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              file_base64: z.string().openapi({ description: "Base64-encoded invoice file" }),
              filename: z.string().openapi({ description: "Filename (.pdf or .xml)" }),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Emit result" } },
  });
  app.openapi(emitRoute, async (c) => {
    const { file_base64, filename } = c.req.valid("json");
    const binaryString = atob(file_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const result = await adapter.emitInvoice({ file: bytes, filename });
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Generate CII ─────────────────────────────────────────
  const generateCIIRoute = createRoute({
    method: "post",
    path: "/api/invoices/generate/cii",
    tags: ["Invoices"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              invoice: z.record(z.unknown()),
              flavor: z.string(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "CII XML string" } },
  });
  app.openapi(generateCIIRoute, async (c) => {
    const { invoice, flavor } = c.req.valid("json");
    const xml = await adapter.generateCII({ invoice, flavor });
    return c.text(xml, 200);
  });

  // ── Generate UBL ─────────────────────────────────────────
  const generateUBLRoute = createRoute({
    method: "post",
    path: "/api/invoices/generate/ubl",
    tags: ["Invoices"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              invoice: z.record(z.unknown()),
              flavor: z.string(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "UBL XML string" } },
  });
  app.openapi(generateUBLRoute, async (c) => {
    const { invoice, flavor } = c.req.valid("json");
    const xml = await adapter.generateUBL({ invoice, flavor });
    return c.text(xml, 200);
  });

  // ── Generate Factur-X ────────────────────────────────────
  const generateFXRoute = createRoute({
    method: "post",
    path: "/api/invoices/generate/facturx",
    tags: ["Invoices"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              invoice: z.record(z.unknown()),
              flavor: z.string(),
              language: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Factur-X PDF (binary)" } },
  });
  app.openapi(generateFXRoute, async (c) => {
    const { invoice, flavor, language } = c.req.valid("json");
    const { data, contentType } = await adapter.generateFacturX({
      invoice, flavor, language,
    });
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  });
}
```

- [ ] **Step 4: Mount invoice routes in app.ts**

Add to `packages/rest/src/app.ts`, before the `return app;`:

```ts
import { registerInvoiceRoutes } from "./routes/invoices.ts";

// Inside createApp(), before return:
registerInvoiceRoutes(app, adapter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
deno test --allow-all packages/rest/src/routes/invoices_test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rest/src/routes/invoices.ts packages/rest/src/routes/invoices_test.ts packages/rest/src/app.ts
git commit -m "feat(rest): add 13 invoice routes"
```

---

### Task 7: Directory + Status routes

**Files:**
- Create: `packages/rest/src/routes/directory.ts`
- Create: `packages/rest/src/routes/status.ts`
- Create: `packages/rest/src/routes/directory_test.ts`
- Create: `packages/rest/src/routes/status_test.ts`
- Modify: `packages/rest/src/app.ts` (mount routes)

- [ ] **Step 1: Write directory test**

Create `packages/rest/src/routes/directory_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

function authed(path: string, init?: RequestInit): [string, RequestInit] {
  return [path, { ...init, headers: { ...init?.headers, Authorization: "Bearer k" } }];
}

describe("Directory routes", () => {
  const { adapter, calls } = createMockAdapter();
  const app = createApp(adapter, "k");

  it("GET /api/directory/fr", async () => {
    const res = await app.request(...authed("/api/directory/fr?q=12345678901234"));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "searchDirectoryFr"), true);
  });

  it("GET /api/directory/int", async () => {
    const res = await app.request(...authed("/api/directory/int?value=FR12345"));
    assertEquals(res.status, 200);
  });

  it("GET /api/directory/peppol/check", async () => {
    const res = await app.request(
      ...authed("/api/directory/peppol/check?scheme=iso6523&value=0208:FR123"),
    );
    assertEquals(res.status, 200);
  });
});
```

- [ ] **Step 2: Write status test**

Create `packages/rest/src/routes/status_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

function authed(path: string, init?: RequestInit): [string, RequestInit] {
  return [path, { ...init, headers: { ...init?.headers, Authorization: "Bearer k" } }];
}

describe("Status routes", () => {
  const { adapter, calls } = createMockAdapter();
  const app = createApp(adapter, "k");

  it("POST /api/invoices/:id/status — sendStatus", async () => {
    const res = await app.request(...authed("/api/invoices/inv-1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "APPROVED" }),
    }));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "sendStatus"), true);
  });

  it("GET /api/invoices/:id/status-history", async () => {
    const res = await app.request(...authed("/api/invoices/inv-1/status-history"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.entries), true);
  });

  it("GET /api/statuses/unseen", async () => {
    const res = await app.request(...authed("/api/statuses/unseen"));
    assertEquals(res.status, 200);
  });

  it("POST /api/statuses/:id/mark-seen", async () => {
    const res = await app.request(...authed("/api/statuses/st-1/mark-seen", {
      method: "POST",
    }));
    assertEquals(res.status, 200);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
deno test --allow-all packages/rest/src/routes/directory_test.ts packages/rest/src/routes/status_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement directory routes**

Create `packages/rest/src/routes/directory.ts`:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerDirectoryRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ── French Directory ─────────────────────────────────────
  const frRoute = createRoute({
    method: "get",
    path: "/api/directory/fr",
    tags: ["Directory"],
    request: {
      query: z.object({
        q: z.string().openapi({ description: "SIRET, SIREN, VAT, or company name" }),
        offset: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
    },
    responses: { 200: { description: "French directory results" } },
  });
  app.openapi(frRoute, async (c) => {
    const { q, offset, limit } = c.req.valid("query");
    const result = await adapter.searchDirectoryFr({ q, offset, limit });
    return c.json(result, 200);
  });

  // ── International Directory ──────────────────────────────
  const intRoute = createRoute({
    method: "get",
    path: "/api/directory/int",
    tags: ["Directory"],
    request: {
      query: z.object({
        value: z.string().openapi({ description: "Participant identifier value" }),
        offset: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
    },
    responses: { 200: { description: "International directory results" } },
  });
  app.openapi(intRoute, async (c) => {
    const { value, offset, limit } = c.req.valid("query");
    const result = await adapter.searchDirectoryInt({ value, offset, limit });
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Check Peppol ─────────────────────────────────────────
  const peppolRoute = createRoute({
    method: "get",
    path: "/api/directory/peppol/check",
    tags: ["Directory"],
    request: {
      query: z.object({
        scheme: z.string(),
        value: z.string(),
      }),
    },
    responses: { 200: { description: "Peppol participant check result" } },
  });
  app.openapi(peppolRoute, async (c) => {
    const { scheme, value } = c.req.valid("query");
    const result = await adapter.checkPeppolParticipant(scheme, value);
    return c.json(result as Record<string, unknown>, 200);
  });
}
```

- [ ] **Step 5: Implement status routes**

Create `packages/rest/src/routes/status.ts`:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerStatusRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ── Send Status ──────────────────────────────────────────
  const sendRoute = createRoute({
    method: "post",
    path: "/api/invoices/{id}/status",
    tags: ["Status"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              code: z.string().openapi({ description: "Status code (e.g. APPROVED, REFUSED)" }),
              message: z.string().optional(),
              payment: z.record(z.unknown()).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Status sent" } },
  });
  app.openapi(sendRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { code, message, payment } = c.req.valid("json");
    const result = await adapter.sendStatus({ invoiceId: id, code, message, payment });
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Status History ───────────────────────────────────────
  const historyRoute = createRoute({
    method: "get",
    path: "/api/invoices/{id}/status-history",
    tags: ["Status"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Status history entries" } },
  });
  app.openapi(historyRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getStatusHistory(id);
    return c.json(result, 200);
  });

  // ── Unseen Statuses ──────────────────────────────────────
  const unseenRoute = createRoute({
    method: "get",
    path: "/api/statuses/unseen",
    tags: ["Status"],
    request: {
      query: z.object({
        offset: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
    },
    responses: { 200: { description: "Unseen statuses" } },
  });
  app.openapi(unseenRoute, async (c) => {
    const { offset, limit } = c.req.valid("query");
    const result = await adapter.getUnseenStatuses({ offset, limit });
    return c.json(result as Record<string, unknown>, 200);
  });

  // ── Mark Status Seen ─────────────────────────────────────
  const markSeenRoute = createRoute({
    method: "post",
    path: "/api/statuses/{id}/mark-seen",
    tags: ["Status"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Status marked as seen" } },
  });
  app.openapi(markSeenRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.markStatusSeen(id);
    return c.json(result as Record<string, unknown>, 200);
  });
}
```

- [ ] **Step 6: Mount in app.ts**

Add imports and calls in `packages/rest/src/app.ts`:

```ts
import { registerDirectoryRoutes } from "./routes/directory.ts";
import { registerStatusRoutes } from "./routes/status.ts";

// Inside createApp(), before return:
registerDirectoryRoutes(app, adapter);
registerStatusRoutes(app, adapter);
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
deno test --allow-all packages/rest/src/routes/directory_test.ts packages/rest/src/routes/status_test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/rest/src/routes/directory.ts packages/rest/src/routes/status.ts packages/rest/src/routes/directory_test.ts packages/rest/src/routes/status_test.ts packages/rest/src/app.ts
git commit -m "feat(rest): add directory (3) and status (4) routes"
```

---

### Task 8: Reporting + Webhook routes

**Files:**
- Create: `packages/rest/src/routes/reporting.ts`
- Create: `packages/rest/src/routes/webhooks.ts`
- Create: `packages/rest/src/routes/reporting_test.ts`
- Create: `packages/rest/src/routes/webhooks_test.ts`
- Modify: `packages/rest/src/app.ts`

- [ ] **Step 1: Write reporting test**

Create `packages/rest/src/routes/reporting_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

function authed(path: string, init?: RequestInit): [string, RequestInit] {
  return [path, { ...init, headers: { ...init?.headers, Authorization: "Bearer k" } }];
}

describe("Reporting routes", () => {
  const { adapter, calls } = createMockAdapter();
  const app = createApp(adapter, "k");

  it("POST /api/reporting/invoice-transaction", async () => {
    const res = await app.request(...authed("/api/reporting/invoice-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "seller", date: "2026-04-01" }),
    }));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "reportInvoiceTransaction"), true);
  });

  it("POST /api/reporting/entities/:entityId/transaction", async () => {
    const res = await app.request(...authed("/api/reporting/entities/ent-1/transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "seller", category: "TLB1" }),
    }));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "reportTransaction"), true);
  });
});
```

- [ ] **Step 2: Write webhook test**

Create `packages/rest/src/routes/webhooks_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

function authed(path: string, init?: RequestInit): [string, RequestInit] {
  return [path, { ...init, headers: { ...init?.headers, Authorization: "Bearer k" } }];
}

describe("Webhook routes", () => {
  const { adapter, calls } = createMockAdapter();
  const app = createApp(adapter, "k");

  it("GET /api/webhooks", async () => {
    const res = await app.request(...authed("/api/webhooks"));
    assertEquals(res.status, 200);
  });

  it("GET /api/webhooks/:id", async () => {
    const res = await app.request(...authed("/api/webhooks/wh-1"));
    assertEquals(res.status, 200);
  });

  it("POST /api/webhooks", async () => {
    const res = await app.request(...authed("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/hook", events: ["invoice.received"] }),
    }));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "createWebhook"), true);
  });

  it("PUT /api/webhooks/:id", async () => {
    const res = await app.request(...authed("/api/webhooks/wh-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    }));
    assertEquals(res.status, 200);
  });

  it("DELETE /api/webhooks/:id", async () => {
    const res = await app.request(...authed("/api/webhooks/wh-1", { method: "DELETE" }));
    assertEquals(res.status, 200);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
deno test --allow-all packages/rest/src/routes/reporting_test.ts packages/rest/src/routes/webhooks_test.ts
```

- [ ] **Step 4: Implement reporting routes**

Create `packages/rest/src/routes/reporting.ts`:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerReportingRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  const invoiceTxRoute = createRoute({
    method: "post",
    path: "/api/reporting/invoice-transaction",
    tags: ["Reporting"],
    request: {
      body: {
        content: { "application/json": { schema: z.record(z.unknown()) } },
      },
    },
    responses: { 200: { description: "Transaction reported" } },
  });
  app.openapi(invoiceTxRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.reportInvoiceTransaction(body);
    return c.json(result as Record<string, unknown>, 200);
  });

  const entityTxRoute = createRoute({
    method: "post",
    path: "/api/reporting/entities/{entityId}/transaction",
    tags: ["Reporting"],
    request: {
      params: z.object({
        entityId: z.string().openapi({ param: { name: "entityId", in: "path" } }),
      }),
      body: {
        content: { "application/json": { schema: z.record(z.unknown()) } },
      },
    },
    responses: { 200: { description: "Transaction reported" } },
  });
  app.openapi(entityTxRoute, async (c) => {
    const { entityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.reportTransaction(entityId, body);
    return c.json(result as Record<string, unknown>, 200);
  });
}
```

- [ ] **Step 5: Implement webhook routes**

Create `packages/rest/src/routes/webhooks.ts`:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerWebhookRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  const listRoute = createRoute({
    method: "get",
    path: "/api/webhooks",
    tags: ["Webhooks"],
    responses: { 200: { description: "Webhook list" } },
  });
  app.openapi(listRoute, async (c) => {
    const result = await adapter.listWebhooks();
    return c.json(result as Record<string, unknown>, 200);
  });

  const getRoute = createRoute({
    method: "get",
    path: "/api/webhooks/{id}",
    tags: ["Webhooks"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Webhook detail" } },
  });
  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getWebhook(id);
    return c.json(result as Record<string, unknown>, 200);
  });

  const createWHRoute = createRoute({
    method: "post",
    path: "/api/webhooks",
    tags: ["Webhooks"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              url: z.string().url(),
              events: z.array(z.string()),
              name: z.string().optional(),
              active: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Webhook created" } },
  });
  app.openapi(createWHRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.createWebhook(body);
    return c.json(result as Record<string, unknown>, 200);
  });

  const updateRoute = createRoute({
    method: "put",
    path: "/api/webhooks/{id}",
    tags: ["Webhooks"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              url: z.string().url().optional(),
              events: z.array(z.string()).optional(),
              name: z.string().optional(),
              active: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Webhook updated" } },
  });
  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.updateWebhook(id, body);
    return c.json(result as Record<string, unknown>, 200);
  });

  const deleteRoute = createRoute({
    method: "delete",
    path: "/api/webhooks/{id}",
    tags: ["Webhooks"],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
    },
    responses: { 200: { description: "Webhook deleted" } },
  });
  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.deleteWebhook(id);
    return c.json(result as Record<string, unknown>, 200);
  });
}
```

- [ ] **Step 6: Mount in app.ts**

Add to `packages/rest/src/app.ts`:

```ts
import { registerReportingRoutes } from "./routes/reporting.ts";
import { registerWebhookRoutes } from "./routes/webhooks.ts";

// Inside createApp():
registerReportingRoutes(app, adapter);
registerWebhookRoutes(app, adapter);
```

- [ ] **Step 7: Run tests**

```bash
deno test --allow-all packages/rest/src/routes/reporting_test.ts packages/rest/src/routes/webhooks_test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/rest/src/routes/
git commit -m "feat(rest): add reporting (2) and webhook (5) routes"
```

---

### Task 9: Config, Entity, and Identifier routes

The largest route group — 18 routes for business entity management.

**Files:**
- Create: `packages/rest/src/routes/config.ts`
- Create: `packages/rest/src/routes/config_test.ts`
- Modify: `packages/rest/src/app.ts`

- [ ] **Step 1: Write test**

Create `packages/rest/src/routes/config_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

function authed(path: string, init?: RequestInit): [string, RequestInit] {
  return [path, { ...init, headers: { ...init?.headers, Authorization: "Bearer k" } }];
}

describe("Config routes", () => {
  const { adapter, calls } = createMockAdapter();
  const app = createApp(adapter, "k");

  it("GET /api/config/customer-id", async () => {
    const res = await app.request(...authed("/api/config/customer-id"));
    assertEquals(res.status, 200);
  });

  it("GET /api/entities", async () => {
    const res = await app.request(...authed("/api/entities"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.count, 0);
  });

  it("GET /api/entities/:id", async () => {
    const res = await app.request(...authed("/api/entities/ent-1"));
    assertEquals(res.status, 200);
  });

  it("POST /api/entities/legal-unit", async () => {
    const res = await app.request(...authed("/api/entities/legal-unit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ACME", siren: "123456789" }),
    }));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "createLegalUnit"), true);
  });

  it("DELETE /api/entities/:id", async () => {
    const res = await app.request(...authed("/api/entities/ent-1", { method: "DELETE" }));
    assertEquals(res.status, 200);
  });

  it("POST /api/entities/:id/claim", async () => {
    const res = await app.request(...authed("/api/entities/ent-1/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    assertEquals(res.status, 200);
  });

  it("POST /api/entities/enroll/french", async () => {
    const res = await app.request(...authed("/api/entities/enroll/french", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siren: "123456789" }),
    }));
    assertEquals(res.status, 200);
    assertEquals(calls.some((c) => c.method === "enrollFrench"), true);
  });

  it("DELETE /api/entities/:entityId/claim", async () => {
    const res = await app.request(...authed("/api/entities/ent-1/claim", { method: "DELETE" }));
    assertEquals(res.status, 200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
deno test --allow-all packages/rest/src/routes/config_test.ts
```

- [ ] **Step 3: Implement config routes**

Create `packages/rest/src/routes/config.ts`:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

const idParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});
const entityIdParam = z.object({
  entityId: z.string().openapi({ param: { name: "entityId", in: "path" } }),
});
const identifierIdParam = z.object({
  identifierId: z.string().openapi({ param: { name: "identifierId", in: "path" } }),
});
const directoryIdParam = z.object({
  directoryId: z.string().openapi({ param: { name: "directoryId", in: "path" } }),
});
const jsonBody = {
  content: { "application/json": { schema: z.record(z.unknown()) } },
};

export function registerConfigRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ── Customer ID ──────────────────────────────────────────
  app.openapi(
    createRoute({ method: "get", path: "/api/config/customer-id", tags: ["Config"], responses: { 200: { description: "Customer ID" } } }),
    async (c) => c.json(await adapter.getCustomerId() as Record<string, unknown>, 200),
  );

  // ── List Entities ────────────────────────────────────────
  app.openapi(
    createRoute({ method: "get", path: "/api/entities", tags: ["Entities"], responses: { 200: { description: "Business entities" } } }),
    async (c) => c.json(await adapter.listBusinessEntities(), 200),
  );

  // ── Get Entity ───────────────────────────────────────────
  app.openapi(
    createRoute({ method: "get", path: "/api/entities/{id}", tags: ["Entities"], request: { params: idParam }, responses: { 200: { description: "Entity detail" } } }),
    async (c) => c.json(await adapter.getBusinessEntity(c.req.valid("param").id) as Record<string, unknown>, 200),
  );

  // ── Create Legal Unit ────────────────────────────────────
  app.openapi(
    createRoute({ method: "post", path: "/api/entities/legal-unit", tags: ["Entities"], request: { body: jsonBody }, responses: { 200: { description: "Legal unit created" } } }),
    async (c) => c.json(await adapter.createLegalUnit(c.req.valid("json")) as Record<string, unknown>, 200),
  );

  // ── Create Office ────────────────────────────────────────
  app.openapi(
    createRoute({ method: "post", path: "/api/entities/office", tags: ["Entities"], request: { body: jsonBody }, responses: { 200: { description: "Office created" } } }),
    async (c) => c.json(await adapter.createOffice(c.req.valid("json")) as Record<string, unknown>, 200),
  );

  // ── Delete Entity ────────────────────────────────────────
  app.openapi(
    createRoute({ method: "delete", path: "/api/entities/{id}", tags: ["Entities"], request: { params: idParam }, responses: { 200: { description: "Entity deleted" } } }),
    async (c) => c.json(await adapter.deleteBusinessEntity(c.req.valid("param").id) as Record<string, unknown>, 200),
  );

  // ── Configure Entity ─────────────────────────────────────
  app.openapi(
    createRoute({ method: "put", path: "/api/entities/{id}/configure", tags: ["Entities"], request: { params: idParam, body: jsonBody }, responses: { 200: { description: "Entity configured" } } }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await adapter.configureBusinessEntity(id, body) as Record<string, unknown>, 200);
    },
  );

  // ── Claim Entity ─────────────────────────────────────────
  app.openapi(
    createRoute({ method: "post", path: "/api/entities/{id}/claim", tags: ["Entities"], request: { params: idParam, body: jsonBody }, responses: { 200: { description: "Entity claimed" } } }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await adapter.claimBusinessEntity(id, body) as Record<string, unknown>, 200);
    },
  );

  // ── Claim by Identifier ──────────────────────────────────
  app.openapi(
    createRoute({
      method: "post", path: "/api/entities/claim-by-identifier", tags: ["Entities"],
      request: { body: { content: { "application/json": { schema: z.object({ scheme: z.string(), value: z.string(), data: z.record(z.unknown()).optional() }) } } } },
      responses: { 200: { description: "Entity claimed by identifier" } },
    }),
    async (c) => {
      const { scheme, value, data } = c.req.valid("json");
      return c.json(await adapter.claimBusinessEntityByIdentifier(scheme, value, data ?? {}) as Record<string, unknown>, 200);
    },
  );

  // ── Enroll French ────────────────────────────────────────
  app.openapi(
    createRoute({ method: "post", path: "/api/entities/enroll/french", tags: ["Entities"], request: { body: jsonBody }, responses: { 200: { description: "French enrollment" } } }),
    async (c) => c.json(await adapter.enrollFrench(c.req.valid("json")) as Record<string, unknown>, 200),
  );

  // ── Enroll International ─────────────────────────────────
  app.openapi(
    createRoute({ method: "post", path: "/api/entities/enroll/international", tags: ["Entities"], request: { body: jsonBody }, responses: { 200: { description: "International enrollment" } } }),
    async (c) => c.json(await adapter.enrollInternational(c.req.valid("json")) as Record<string, unknown>, 200),
  );

  // ── Register Network ─────────────────────────────────────
  app.openapi(
    createRoute({
      method: "post", path: "/api/identifiers/{identifierId}/register-network", tags: ["Identifiers"],
      request: {
        params: identifierIdParam,
        body: { content: { "application/json": { schema: z.object({ network: z.string() }) } } },
      },
      responses: { 200: { description: "Network registered" } },
    }),
    async (c) => {
      const { identifierId } = c.req.valid("param");
      const { network } = c.req.valid("json");
      return c.json(await adapter.registerNetwork(identifierId, network) as Record<string, unknown>, 200);
    },
  );

  // ── Register Network by Scheme ───────────────────────────
  app.openapi(
    createRoute({
      method: "post", path: "/api/identifiers/register-network-by-scheme", tags: ["Identifiers"],
      request: { body: { content: { "application/json": { schema: z.object({ scheme: z.string(), value: z.string(), network: z.string() }) } } } },
      responses: { 200: { description: "Network registered by scheme" } },
    }),
    async (c) => {
      const { scheme, value, network } = c.req.valid("json");
      return c.json(await adapter.registerNetworkByScheme(scheme, value, network) as Record<string, unknown>, 200);
    },
  );

  // ── Unregister Network ───────────────────────────────────
  app.openapi(
    createRoute({ method: "delete", path: "/api/identifiers/network/{directoryId}", tags: ["Identifiers"], request: { params: directoryIdParam }, responses: { 200: { description: "Network unregistered" } } }),
    async (c) => c.json(await adapter.unregisterNetwork(c.req.valid("param").directoryId) as Record<string, unknown>, 200),
  );

  // ── Create Identifier ────────────────────────────────────
  app.openapi(
    createRoute({ method: "post", path: "/api/entities/{entityId}/identifiers", tags: ["Identifiers"], request: { params: entityIdParam, body: jsonBody }, responses: { 200: { description: "Identifier created" } } }),
    async (c) => {
      const { entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await adapter.createIdentifier(entityId, body) as Record<string, unknown>, 200);
    },
  );

  // ── Create Identifier by Scheme ──────────────────────────
  app.openapi(
    createRoute({
      method: "post", path: "/api/identifiers/by-scheme", tags: ["Identifiers"],
      request: { body: { content: { "application/json": { schema: z.object({ scheme: z.string(), value: z.string(), data: z.record(z.unknown()).optional() }) } } } },
      responses: { 200: { description: "Identifier created by scheme" } },
    }),
    async (c) => {
      const { scheme, value, data } = c.req.valid("json");
      return c.json(await adapter.createIdentifierByScheme(scheme, value, data ?? {}) as Record<string, unknown>, 200);
    },
  );

  // ── Delete Identifier ────────────────────────────────────
  app.openapi(
    createRoute({ method: "delete", path: "/api/identifiers/{identifierId}", tags: ["Identifiers"], request: { params: identifierIdParam }, responses: { 200: { description: "Identifier deleted" } } }),
    async (c) => c.json(await adapter.deleteIdentifier(c.req.valid("param").identifierId) as Record<string, unknown>, 200),
  );

  // ── Delete Claim ─────────────────────────────────────────
  app.openapi(
    createRoute({ method: "delete", path: "/api/entities/{entityId}/claim", tags: ["Entities"], request: { params: entityIdParam }, responses: { 200: { description: "Claim deleted" } } }),
    async (c) => c.json(await adapter.deleteClaim(c.req.valid("param").entityId) as Record<string, unknown>, 200),
  );
}
```

- [ ] **Step 4: Mount in app.ts**

```ts
import { registerConfigRoutes } from "./routes/config.ts";

// Inside createApp():
registerConfigRoutes(app, adapter);
```

- [ ] **Step 5: Run tests**

```bash
deno test --allow-all packages/rest/src/routes/config_test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rest/
git commit -m "feat(rest): add config, entity, and identifier routes (18)"
```

---

### Task 10: Full integration — run all tests

Verify everything works together.

**Files:** none (verification only)

- [ ] **Step 1: Run full REST test suite**

```bash
deno test --allow-all packages/rest/
```

Expected: all REST route tests pass.

- [ ] **Step 2: Run full monorepo test suite**

```bash
deno task test
```

Expected: all tests pass (core adapter tests + MCP tool tests + REST route tests).

- [ ] **Step 3: Test REST server manually**

```bash
deno run --allow-all packages/rest/server.ts --no-auth --adapter=iopole &
sleep 2
curl http://localhost:3016/openapi.json | head -20
curl http://localhost:3016/api/health
kill %1
```

Expected: OpenAPI JSON with all routes, health check returns `{"status":"ok","adapter":"iopole"}`.

- [ ] **Step 4: Verify MCP still works**

```bash
deno run --allow-all packages/mcp/server.ts --http --port=3015 &
sleep 2
curl -X POST http://localhost:3015/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
kill %1
```

Expected: tools list response with all einvoice tools.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: monorepo restructure complete — all tests green"
```
