/**
 * Adapter Contract Tests
 *
 * Standardized test suite that any EInvoiceAdapter must pass.
 * Validates structural correctness (right shape) and semantic
 * correctness (right values) for all typed returns.
 *
 * Usage in your adapter_test.ts:
 *
 *   import { runAdapterContract } from "../../testing/adapter-contract.ts";
 *
 *   Deno.test("MyAdapter satisfies contract", async (t) => {
 *     const adapter = createMyAdapter(testConfig);
 *     await runAdapterContract(t, adapter, {
 *       testInvoiceId: "known-sandbox-invoice-id",
 *     });
 *   });
 *
 * @module testing/adapter-contract
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "jsr:@std/assert";
import type { AdapterMethodName, EInvoiceAdapter } from "../adapter.ts";

export interface ContractOptions {
  /** Invoice ID to use for single-entity methods (getInvoice, download, etc.).
   *  Defaults to "contract-test-id". Real adapters should provide a known sandbox ID. */
  testInvoiceId?: string;
  /** Webhook ID for getWebhook. Defaults to "contract-test-webhook". */
  testWebhookId?: string;
}

// Keep in sync with EInvoiceAdapter interface in adapter.ts
// (same pattern as createMockAdapter().capabilities in helpers.ts)
const VALID_ADAPTER_METHODS = new Set([
  "getCustomerId", "listBusinessEntities", "getBusinessEntity",
  "createLegalUnit", "createOffice", "enrollFrench", "enrollInternational",
  "claimBusinessEntity", "claimBusinessEntityByIdentifier", "deleteBusinessEntity",
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

export async function runAdapterContract(
  t: Deno.TestContext,
  adapter: EInvoiceAdapter,
  options: ContractOptions = {},
): Promise<void> {
  const invoiceId = options.testInvoiceId ?? "contract-test-id";
  const webhookId = options.testWebhookId ?? "contract-test-webhook";

  // ═══════════════════════════════════════════════
  // IDENTITY & CAPABILITIES
  // ═══════════════════════════════════════════════

  await t.step("name is a non-empty lowercase string", () => {
    assertExists(adapter.name);
    assertEquals(typeof adapter.name, "string");
    assert(adapter.name.length > 0);
    assertEquals(adapter.name, adapter.name.toLowerCase(),
      `Adapter name must be lowercase, got "${adapter.name}"`);
  });

  await t.step("capabilities is a non-empty Set", () => {
    assertExists(adapter.capabilities);
    assert(adapter.capabilities instanceof Set);
    assert(adapter.capabilities.size > 0, "Adapter must support at least one method");
  });

  await t.step("capabilities only contains valid AdapterMethodName values", () => {
    for (const cap of adapter.capabilities) {
      assert(VALID_ADAPTER_METHODS.has(cap), `Unknown capability: "${cap}"`);
    }
  });

  // ═══════════════════════════════════════════════
  // UNSUPPORTED METHODS → NotSupportedError
  // ═══════════════════════════════════════════════

  await t.step("unsupported methods throw NotSupportedError", async () => {
    const probes: Array<{ method: AdapterMethodName; call: () => Promise<unknown> }> = [
      { method: "searchInvoices", call: () => adapter.searchInvoices({}) },
      { method: "getCustomerId", call: () => adapter.getCustomerId() },
      { method: "listBusinessEntities", call: () => adapter.listBusinessEntities() },
      { method: "searchDirectoryFr", call: () => adapter.searchDirectoryFr({ q: "test" }) },
      { method: "listWebhooks", call: () => adapter.listWebhooks() },
      { method: "getStatusHistory", call: () => adapter.getStatusHistory("x") },
      { method: "getInvoice", call: () => adapter.getInvoice("x") },
      { method: "downloadInvoice", call: () => adapter.downloadInvoice("x") },
      { method: "getInvoiceFiles", call: () => adapter.getInvoiceFiles("x") },
      { method: "generateCII", call: () => adapter.generateCII({ invoice: {}, flavor: "test" }) },
    ];

    let testedCount = 0;
    for (const { method, call } of probes) {
      if (!adapter.capabilities.has(method)) {
        testedCount++;
        try {
          await call();
          throw new Error(`${method} should have thrown NotSupportedError`);
        } catch (e) {
          assertEquals((e as Error).name, "NotSupportedError",
            `${method} threw "${(e as Error).name}" instead of NotSupportedError`);
        }
      }
    }
    // Explicit: if 0 probes tested, all must be in capabilities (not a silent skip)
    if (testedCount === 0) {
      for (const { method } of probes) {
        assert(adapter.capabilities.has(method),
          `${method} not in capabilities but was not tested for NotSupportedError`);
      }
    }
  });

  // ═══════════════════════════════════════════════
  // INVOICE OPERATIONS — typed shapes
  // ═══════════════════════════════════════════════

  if (adapter.capabilities.has("searchInvoices")) {
    await t.step("searchInvoices returns { rows: InvoiceSearchRow[], count: number }", async () => {
      const result = await adapter.searchInvoices({});
      assertExists(result.rows, "Missing 'rows' — did you return { results: [...] } instead?");
      assert(Array.isArray(result.rows), "'rows' must be an array");
      assertEquals(typeof result.count, "number", "'count' must be a number");
      assert(result.rows.length > 0,
        "searchInvoices returned empty rows — contract needs at least 1 row to validate shape");
    });

    await t.step("searchInvoices rows have required fields and valid values", async () => {
      const result = await adapter.searchInvoices({});
      for (const row of result.rows) {
        assertExists(row.id, "Row must have 'id'");
        assertEquals(typeof row.id, "string", "Row 'id' must be a string");
        if (row.direction !== undefined) {
          assert(
            row.direction === "sent" || row.direction === "received",
            `Row direction must be "sent"|"received", got "${row.direction}" — did you forget to normalize from "in"/"out"?`,
          );
        }
        if (row.amount !== undefined) {
          assertEquals(typeof row.amount, "number",
            `Row amount must be a number, got ${typeof row.amount} — did you forget Number() coercion?`);
        }
      }
    });
  }

  if (adapter.capabilities.has("getInvoice")) {
    await t.step("getInvoice returns InvoiceDetail with required fields", async () => {
      const inv = await adapter.getInvoice(invoiceId);
      assertExists(inv.id, "InvoiceDetail must have 'id'");
      assertEquals(typeof inv.id, "string", "'id' must be a string");
      if (inv.direction !== undefined) {
        assert(
          inv.direction === "sent" || inv.direction === "received",
          `direction must be "sent"|"received", got "${inv.direction}"`,
        );
      }
      if (inv.lines !== undefined) {
        assert(Array.isArray(inv.lines), "'lines' must be an array");
      }
      if (inv.totalHt !== undefined) {
        assertEquals(typeof inv.totalHt, "number", "'totalHt' must be a number");
      }
      if (inv.totalTtc !== undefined) {
        assertEquals(typeof inv.totalTtc, "number", "'totalTtc' must be a number");
      }
    });
  }

  if (adapter.capabilities.has("downloadInvoice")) {
    await t.step("downloadInvoice returns { data: Uint8Array, contentType: string }", async () => {
      const result = await adapter.downloadInvoice(invoiceId);
      assertExists(result.data, "DownloadResult must have 'data'");
      assert(result.data instanceof Uint8Array,
        `'data' must be Uint8Array, got ${result.data.constructor?.name ?? typeof result.data} — did you coerce through text?`);
      assertExists(result.contentType, "DownloadResult must have 'contentType'");
      assertEquals(typeof result.contentType, "string");
    });
  }

  if (adapter.capabilities.has("downloadReadable")) {
    await t.step("downloadReadable returns { data: Uint8Array, contentType: string }", async () => {
      const result = await adapter.downloadReadable(invoiceId);
      assert(result.data instanceof Uint8Array, "'data' must be Uint8Array");
      assertEquals(typeof result.contentType, "string");
    });
  }

  if (adapter.capabilities.has("getInvoiceFiles")) {
    await t.step("getInvoiceFiles returns FileEntry[] with id per entry", async () => {
      const files = await adapter.getInvoiceFiles(invoiceId);
      assert(Array.isArray(files), "getInvoiceFiles must return an array");
      assert(files.length > 0, "getInvoiceFiles returned empty — contract needs at least 1 entry");
      for (const file of files) {
        assertExists(file.id, "FileEntry must have 'id'");
        assertEquals(typeof file.id, "string");
      }
    });
  }

  if (adapter.capabilities.has("getAttachments")) {
    await t.step("getAttachments returns FileEntry[] with id per entry", async () => {
      const files = await adapter.getAttachments(invoiceId);
      assert(Array.isArray(files), "getAttachments must return an array");
      assert(files.length > 0, "getAttachments returned empty — contract needs at least 1 entry");
      for (const file of files) {
        assertExists(file.id, "FileEntry must have 'id'");
        assertEquals(typeof file.id, "string");
      }
    });
  }

  if (adapter.capabilities.has("downloadFile")) {
    await t.step("downloadFile returns { data: Uint8Array, contentType: string }", async () => {
      const result = await adapter.downloadFile("contract-test-file");
      assert(result.data instanceof Uint8Array, "'data' must be Uint8Array");
      assertEquals(typeof result.contentType, "string");
    });
  }

  // ═══════════════════════════════════════════════
  // GENERATE OPERATIONS
  // ═══════════════════════════════════════════════

  if (adapter.capabilities.has("generateCII")) {
    await t.step("generateCII returns a non-empty string", async () => {
      const result = await adapter.generateCII({ invoice: {}, flavor: "minimum" });
      assertEquals(typeof result, "string", "generateCII must return a string");
      assert(result.length > 0, "generateCII returned empty string");
    });
  }

  if (adapter.capabilities.has("generateUBL")) {
    await t.step("generateUBL returns a non-empty string", async () => {
      const result = await adapter.generateUBL({ invoice: {}, flavor: "minimum" });
      assertEquals(typeof result, "string", "generateUBL must return a string");
      assert(result.length > 0, "generateUBL returned empty string");
    });
  }

  if (adapter.capabilities.has("generateFacturX")) {
    await t.step("generateFacturX returns { data: Uint8Array, contentType: string }", async () => {
      const result = await adapter.generateFacturX({ invoice: {}, flavor: "minimum" });
      assert(result.data instanceof Uint8Array, "'data' must be Uint8Array");
      assertEquals(typeof result.contentType, "string");
    });
  }

  // ═══════════════════════════════════════════════
  // STATUS OPERATIONS
  // ═══════════════════════════════════════════════

  if (adapter.capabilities.has("getStatusHistory")) {
    await t.step("getStatusHistory returns { entries: StatusEntry[] }", async () => {
      const result = await adapter.getStatusHistory(invoiceId);
      assertExists(result.entries, "Missing 'entries' — did you return { history: [...] } instead?");
      assert(Array.isArray(result.entries), "'entries' must be an array");
    });

    await t.step("getStatusHistory entries have required fields", async () => {
      const result = await adapter.getStatusHistory(invoiceId);
      assert(result.entries.length > 0, "getStatusHistory returned empty entries — contract needs at least 1");
      for (const entry of result.entries) {
        assertExists(entry.date, "StatusEntry must have 'date'");
        assertEquals(typeof entry.date, "string", "'date' must be a string");
        assertExists(entry.code, "StatusEntry must have 'code'");
        assertEquals(typeof entry.code, "string", "'code' must be a string");
      }
    });
  }

  // ═══════════════════════════════════════════════
  // DIRECTORY OPERATIONS
  // ═══════════════════════════════════════════════

  if (adapter.capabilities.has("searchDirectoryFr")) {
    await t.step("searchDirectoryFr returns { rows: DirectoryFrRow[], count: number }", async () => {
      const result = await adapter.searchDirectoryFr({ q: "test" });
      assertExists(result.rows, "Missing 'rows'");
      assert(Array.isArray(result.rows));
      assertEquals(typeof result.count, "number");
      assert(result.rows.length > 0,
        "searchDirectoryFr returned empty rows — contract needs at least 1 row");
    });

    await t.step("searchDirectoryFr rows have entityId", async () => {
      const result = await adapter.searchDirectoryFr({ q: "test" });
      assert(result.rows.length > 0, "searchDirectoryFr returned empty rows");
      for (const row of result.rows) {
        assertExists(row.entityId, "DirectoryFrRow must have 'entityId'");
        assertEquals(typeof row.entityId, "string");
      }
    });
  }

  if (adapter.capabilities.has("searchDirectoryInt")) {
    await t.step("searchDirectoryInt returns { rows: DirectoryIntRow[], count: number }", async () => {
      const result = await adapter.searchDirectoryInt({ value: "test" });
      assertExists(result.rows, "Missing 'rows'");
      assert(Array.isArray(result.rows));
      assertEquals(typeof result.count, "number");
      assert(result.rows.length > 0,
        "searchDirectoryInt returned empty rows — contract needs at least 1 row");
      for (const row of result.rows) {
        if (row.identifier !== undefined) {
          assertEquals(typeof row.identifier, "string", "'identifier' must be a string");
        }
      }
    });
  }

  // ═══════════════════════════════════════════════
  // CONFIG OPERATIONS
  // ═══════════════════════════════════════════════

  if (adapter.capabilities.has("getCustomerId")) {
    await t.step("getCustomerId returns a non-empty string", async () => {
      const result = await adapter.getCustomerId();
      assertEquals(typeof result, "string", "getCustomerId must return a string");
      assert(result.length > 0, "getCustomerId returned empty string");
    });
  }

  if (adapter.capabilities.has("listBusinessEntities")) {
    await t.step("listBusinessEntities returns { rows: BusinessEntityRow[], count: number }", async () => {
      const result = await adapter.listBusinessEntities();
      assertExists(result.rows, "Missing 'rows'");
      assert(Array.isArray(result.rows));
      assertEquals(typeof result.count, "number");
      assert(result.rows.length > 0,
        "listBusinessEntities returned empty rows — contract needs at least 1 row");
    });

    await t.step("listBusinessEntities rows have entityId", async () => {
      const result = await adapter.listBusinessEntities();
      assert(result.rows.length > 0, "listBusinessEntities returned empty rows");
      for (const row of result.rows) {
        assertExists(row.entityId, "BusinessEntityRow must have 'entityId'");
        assertEquals(typeof row.entityId, "string");
      }
    });
  }

  // ═══════════════════════════════════════════════
  // WEBHOOK OPERATIONS
  // ═══════════════════════════════════════════════

  if (adapter.capabilities.has("listWebhooks")) {
    await t.step("listWebhooks returns WebhookDetail[]", async () => {
      const result = await adapter.listWebhooks();
      assert(Array.isArray(result), "listWebhooks must return an array");
      assert(result.length > 0, "listWebhooks returned empty — contract needs at least 1 webhook");
      for (const wh of result) {
        assertExists(wh.id, "WebhookDetail must have 'id'");
        assertEquals(typeof wh.id, "string");
      }
    });
  }

  if (adapter.capabilities.has("getWebhook")) {
    await t.step("getWebhook returns WebhookDetail with id", async () => {
      const wh = await adapter.getWebhook(webhookId);
      assertExists(wh.id, "WebhookDetail must have 'id'");
      assertEquals(typeof wh.id, "string");
    });
  }

  if (adapter.capabilities.has("createWebhook")) {
    await t.step("createWebhook returns WebhookDetail with id", async () => {
      const wh = await adapter.createWebhook({ url: "https://test.example.com/hook", events: ["invoice.created"] });
      assertExists(wh.id, "WebhookDetail must have 'id'");
      assertEquals(typeof wh.id, "string");
    });
  }

  if (adapter.capabilities.has("updateWebhook")) {
    await t.step("updateWebhook returns WebhookDetail with id", async () => {
      const wh = await adapter.updateWebhook(webhookId, { name: "updated" });
      assertExists(wh.id, "WebhookDetail must have 'id'");
      assertEquals(typeof wh.id, "string");
    });
  }
}
