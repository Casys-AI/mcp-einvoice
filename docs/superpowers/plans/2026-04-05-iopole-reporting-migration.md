# Iopole Reporting API Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 2 Iopole reporting adapter methods and tools to the new API endpoints (old `/reporting/fr/*` paths were removed by Iopole).

**Architecture:** The adapter interface changes from `businessEntityId` to `identifierScheme` + `identifierValue` for routing. The tool schemas gain `identifier_scheme` and `identifier_value` fields. The adapter implementation switches to the new URL pattern. Other adapters (SUPER PDP, AFNOR) also implement these methods — their implementations don't change (different API), but the interface signature does.

**Tech Stack:** Deno, TypeScript

---

## API Change Summary

| Method | Old Iopole endpoint | New Iopole endpoint |
|--------|-------------------|-------------------|
| `reportInvoiceTransaction` | `POST /reporting/fr/invoice/transaction` (body = freeform) | `POST /reporting/transaction/invoice/scheme/{s}/value/{v}` (body = `{ invoice }`, query = `reportIdentifier?`) |
| `reportTransaction` | `POST /reporting/fr/transaction/{businessEntityId}` (body = freeform) | `POST /reporting/transaction/scheme/{s}/value/{v}` (body = `{ transactionDate, registerId, storeId, closureId, transactions }`) |

New endpoints also added (not yet mapped to adapter methods):
- `POST /reporting/payment/invoice/scheme/{s}/value/{v}` — payment for invoice transaction
- `POST /reporting/payment/transaction/scheme/{s}/value/{v}` — payment for transaction
- `GET /reporting/report/scheme/{s}/value/{v}` — get report for period
- `GET /reporting/report/{reportId}/transaction` — get report transactions

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/core/src/adapter.ts` | Change `reportInvoiceTransaction` and `reportTransaction` signatures |
| Modify | `packages/core/src/adapters/base-adapter.ts` | Update stub signatures |
| Modify | `packages/core/src/adapters/iopole/adapter.ts` | New endpoint URLs with `scheme`/`value` path params |
| Modify | `packages/core/src/adapters/afnor/base-adapter.ts` | Update signature (AFNOR flow body unchanged) |
| Modify | `packages/core/src/adapters/superpdp/adapter.ts` | Update signature if overridden |
| Modify | `packages/mcp/src/tools/reporting.ts` | Add `identifier_scheme` + `identifier_value` to inputSchema |
| Modify | `packages/mcp/src/tools/reporting_test.ts` | Update test assertions |
| Modify | `packages/core/src/adapters/iopole/adapter_test.ts` | Update endpoint URL assertions |
| Modify | `packages/core/src/testing/helpers.ts` | Update mock method signatures |
| Modify | `packages/core/src/adapters/iopole/api-specs/operator-reporting.json` | Already updated (live spec copied) |

---

### Task 1: Update adapter interface signatures

**Files:**
- Modify: `packages/core/src/adapter.ts`
- Modify: `packages/core/src/adapters/base-adapter.ts`
- Modify: `packages/core/src/testing/helpers.ts`

- [ ] **Step 1: Change interface signatures in adapter.ts**

Replace the old reporting method signatures:

```typescript
// Old:
reportInvoiceTransaction(
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>>;
reportTransaction(
  businessEntityId: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>>;
```

With:

```typescript
// New:
reportInvoiceTransaction(
  identifierScheme: string,
  identifierValue: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>>;
reportTransaction(
  identifierScheme: string,
  identifierValue: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>>;
```

- [ ] **Step 2: Update BaseAdapter stubs**

In `packages/core/src/adapters/base-adapter.ts`, update both method stubs to match the new signatures. The body stays the same (throws NotSupportedError).

```typescript
async reportInvoiceTransaction(
  _identifierScheme: string,
  _identifierValue: string,
  _transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return this.notSupported("reportInvoiceTransaction", "...");
}

async reportTransaction(
  _identifierScheme: string,
  _identifierValue: string,
  _transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return this.notSupported("reportTransaction", "...");
}
```

- [ ] **Step 3: Update mock adapter**

In `packages/core/src/testing/helpers.ts`, update the mock method signatures:

```typescript
reportInvoiceTransaction: (scheme, value, t) =>
  record("reportInvoiceTransaction", scheme, value, t) as Promise<Record<string, unknown>>,
reportTransaction: (scheme, value, t) =>
  record("reportTransaction", scheme, value, t) as Promise<Record<string, unknown>>,
```

- [ ] **Step 4: Run type check**

Run: `deno check packages/core/mod.ts`

Expected: FAIL — Iopole, SUPER PDP, and AFNOR adapters still have old signatures. This confirms the interface change propagated correctly.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapter.ts packages/core/src/adapters/base-adapter.ts packages/core/src/testing/helpers.ts
git commit -m "refactor: update reporting method signatures (scheme/value instead of entityId)"
```

---

### Task 2: Update Iopole adapter — new endpoints

**Files:**
- Modify: `packages/core/src/adapters/iopole/adapter.ts`
- Test: `packages/core/src/adapters/iopole/adapter_test.ts`

- [ ] **Step 1: Write failing test for reportInvoiceTransaction**

In `adapter_test.ts`, update the existing test:

```typescript
Deno.test("IopoleAdapter.reportInvoiceTransaction() - POST /reporting/transaction/invoice/scheme/{s}/value/{v}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "abc-123" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.reportInvoiceTransaction(
      "0009",
      "43446637100011",
      { invoice: { number: "F-001", amount: 1000 } },
    );

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/reporting/transaction/invoice/scheme/0009/value/43446637100011",
    );
    assertEquals(result, { guid: "abc-123" });
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Write failing test for reportTransaction**

```typescript
Deno.test("IopoleAdapter.reportTransaction() - POST /reporting/transaction/scheme/{s}/value/{v}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "def-456" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.reportTransaction(
      "0009",
      "43446637100011",
      { transactionDate: "2026-04-01", transactions: [] },
    );

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/reporting/transaction/scheme/0009/value/43446637100011",
    );
    assertEquals(captured[0].body, { transactionDate: "2026-04-01", transactions: [] });
    assertEquals(result, { guid: "def-456" });
  } finally {
    restore();
  }
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `deno test packages/core/src/adapters/iopole/adapter_test.ts --filter "reportInvoice"`

Expected: FAIL (old method signature)

- [ ] **Step 4: Implement new endpoints in IopoleAdapter**

In `adapter.ts`, replace the two reporting methods:

```typescript
override async reportInvoiceTransaction(
  identifierScheme: string,
  identifierValue: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return await this.client.post(
    `/reporting/transaction/invoice/scheme/${
      encodePathSegment(identifierScheme)
    }/value/${encodePathSegment(identifierValue)}`,
    transaction,
  ) as Record<string, unknown>;
}

override async reportTransaction(
  identifierScheme: string,
  identifierValue: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return await this.client.post(
    `/reporting/transaction/scheme/${
      encodePathSegment(identifierScheme)
    }/value/${encodePathSegment(identifierValue)}`,
    transaction,
  ) as Record<string, unknown>;
}
```

- [ ] **Step 5: Run Iopole tests**

Run: `deno test packages/core/src/adapters/iopole/adapter_test.ts`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/adapters/iopole/adapter.ts packages/core/src/adapters/iopole/adapter_test.ts
git commit -m "feat: migrate Iopole reporting to new /reporting/transaction/* endpoints"
```

---

### Task 3: Update AFNOR and SUPER PDP adapters

**Files:**
- Modify: `packages/core/src/adapters/afnor/base-adapter.ts`
- Modify: `packages/core/src/adapters/superpdp/adapter.ts` (if it overrides)

- [ ] **Step 1: Check if SUPER PDP overrides reporting methods**

```bash
grep -n "reportInvoiceTransaction\|reportTransaction" packages/core/src/adapters/superpdp/adapter.ts
```

If it overrides, update signatures. If not (inherits from AfnorBaseAdapter), only AFNOR needs updating.

- [ ] **Step 2: Update AfnorBaseAdapter**

The AFNOR flow API uses a different endpoint pattern (flow submission). The method signature changes but the body construction stays the same. Update the method signatures to accept `identifierScheme` + `identifierValue` instead of the old params.

In `packages/core/src/adapters/afnor/base-adapter.ts`:

```typescript
override async reportInvoiceTransaction(
  identifierScheme: string,
  identifierValue: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // AFNOR flow submission — uses its own endpoint, ignores scheme/value
  const afnor = this.getAfnorClient();
  return await afnor.submitFlow(/* existing body construction */) as Record<string, unknown>;
}

override async reportTransaction(
  _identifierScheme: string,
  _identifierValue: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const afnor = this.getAfnorClient();
  return await afnor.submitFlow(/* existing body construction */) as Record<string, unknown>;
}
```

Note: AFNOR uses its own flow API. The scheme/value params are unused but the signature must match the interface.

- [ ] **Step 3: Run AFNOR + SUPER PDP tests**

Run: `deno test packages/core/src/adapters/afnor/ packages/core/src/adapters/superpdp/`

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/adapters/afnor/ packages/core/src/adapters/superpdp/
git commit -m "refactor: update AFNOR/SUPER PDP reporting signatures to match new interface"
```

---

### Task 4: Update reporting tools — new input schema

**Files:**
- Modify: `packages/mcp/src/tools/reporting.ts`
- Test: `packages/mcp/src/tools/reporting_test.ts`

- [ ] **Step 1: Write failing test for invoice transaction tool**

```typescript
Deno.test("einvoice_reporting_invoice_transaction - passes scheme/value to adapter", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_reporting_invoice_transaction");

  await tool.handler({
    identifier_scheme: "0009",
    identifier_value: "43446637100011",
    transaction: { invoice: { number: "F-001" } },
  }, { adapter });

  assertEquals(calls[0].method, "reportInvoiceTransaction");
  assertEquals(calls[0].args[0], "0009");
  assertEquals(calls[0].args[1], "43446637100011");
});
```

- [ ] **Step 2: Update the tool inputSchema and handler**

In `reporting.ts`, update `einvoice_reporting_invoice_transaction`:

```typescript
{
  name: "einvoice_reporting_invoice_transaction",
  requires: ["reportInvoiceTransaction"],
  description:
    "Report an invoice transaction to the French tax authority (e-reporting). " +
    "Required for B2C and international invoice transactions. " +
    "Identify the business entity by scheme (0009 for SIRET) and value.",
  category: "reporting",
  inputSchema: {
    type: "object",
    properties: {
      identifier_scheme: {
        type: "string",
        description: "Identifier scheme (e.g. '0009' for SIRET, '0002' for SIREN)",
      },
      identifier_value: {
        type: "string",
        description: "Identifier value (e.g. SIRET number)",
      },
      transaction: {
        type: "object",
        description:
          "Invoice transaction data for DGFiP e-reporting. " +
          "Wraps the invoice object: { invoice: { number, amount, ... } }. " +
          "Exact schema depends on the PA provider.",
      },
    },
    required: ["identifier_scheme", "identifier_value", "transaction"],
  },
  _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
  handler: async (input, ctx) => {
    if (!input.identifier_scheme || !input.identifier_value || !input.transaction) {
      throw new Error(
        "[einvoice_reporting_invoice_transaction] 'identifier_scheme', 'identifier_value', and 'transaction' are required",
      );
    }
    const result = await ctx.adapter.reportInvoiceTransaction(
      input.identifier_scheme as string,
      input.identifier_value as string,
      input.transaction as Record<string, unknown>,
    );
    return {
      content: `Déclaration e-reporting (facture) envoyée pour ${input.identifier_scheme}:${input.identifier_value}`,
      structuredContent: {
        action: "Déclaration e-reporting",
        status: "success",
        title: "Transaction facture déclarée",
        details: result,
      },
    };
  },
},
```

- [ ] **Step 3: Update `einvoice_reporting_transaction` tool**

Same pattern — replace `business_entity_id` with `identifier_scheme` + `identifier_value`:

```typescript
{
  name: "einvoice_reporting_transaction",
  requires: ["reportTransaction"],
  description:
    "Report a non-invoice transaction to the French tax authority (e-reporting). " +
    "Covers cash transactions, payment data, etc. " +
    "Identify the business entity by scheme (0009 for SIRET) and value.",
  category: "reporting",
  inputSchema: {
    type: "object",
    properties: {
      identifier_scheme: {
        type: "string",
        description: "Identifier scheme (e.g. '0009' for SIRET)",
      },
      identifier_value: {
        type: "string",
        description: "Identifier value (e.g. SIRET number)",
      },
      transaction: {
        type: "object",
        description:
          "Non-invoice transaction data for DGFiP e-reporting. " +
          "Fields: transactionDate (YYYY-MM-DD), registerId, storeId, closureId, " +
          "transactions (array of line items). Exact schema depends on PA.",
      },
    },
    required: ["identifier_scheme", "identifier_value", "transaction"],
  },
  _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
  handler: async (input, ctx) => {
    if (!input.identifier_scheme || !input.identifier_value || !input.transaction) {
      throw new Error(
        "[einvoice_reporting_transaction] 'identifier_scheme', 'identifier_value', and 'transaction' are required",
      );
    }
    const result = await ctx.adapter.reportTransaction(
      input.identifier_scheme as string,
      input.identifier_value as string,
      input.transaction as Record<string, unknown>,
    );
    return {
      content: `Déclaration e-reporting (transaction) envoyée pour ${input.identifier_scheme}:${input.identifier_value}`,
      structuredContent: {
        action: "Déclaration e-reporting",
        status: "success",
        title: `Transaction déclarée pour ${input.identifier_scheme}:${input.identifier_value}`,
        details: result,
      },
    };
  },
},
```

- [ ] **Step 4: Update all reporting tests**

Update existing tests to use new parameter names. The `_meta` and structuredContent tests just need parameter name changes.

- [ ] **Step 5: Run all tests**

Run: `deno task test`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/reporting.ts packages/mcp/src/tools/reporting_test.ts
git commit -m "feat: update reporting tools for scheme/value identification"
```

---

### Task 5: Update pretty-printed specs and run final verification

- [ ] **Step 1: Generate pretty-printed reporting spec**

```bash
python3 -c "import json; d=json.load(open('packages/core/src/adapters/iopole/api-specs/operator-reporting.json')); json.dump(d, open('packages/core/src/adapters/iopole/api-specs/operator-reporting-pretty.json','w'), indent=2)"
```

Do the same for invoicing and config specs.

- [ ] **Step 2: Run full test suite**

Run: `deno task test`

Expected: ALL PASS

- [ ] **Step 3: Commit specs + final**

```bash
git add packages/core/src/adapters/iopole/api-specs/
git commit -m "chore: update Iopole API specs (2026-04-05) — new reporting paths, config onboarding stages"
```
