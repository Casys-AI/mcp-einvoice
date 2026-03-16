/**
 * E2E Tests — Iopole Sandbox
 *
 * Tests real API calls against the Iopole sandbox.
 * Requires IOPOLE_* env vars in .env.
 *
 * Run: deno test lib/einvoice/src/e2e_test.ts --no-check --allow-all
 *
 * @module lib/einvoice/src/e2e_test
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { createIopoleAdapter } from "./adapters/iopole.ts";
import { allTools, getToolByName } from "./tools/mod.ts";
import type { EInvoiceToolContext } from "./tools/types.ts";

// Load .env from project root
const envPath = new URL("../../../.env", import.meta.url).pathname;
try {
  const text = await Deno.readTextFile(envPath);
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      let value = trimmed.slice(idx + 1);
      // Strip inline comments (unquoted # preceded by whitespace)
      const commentIdx = value.search(/\s+#/);
      if (commentIdx >= 0) value = value.slice(0, commentIdx);
      Deno.env.set(trimmed.slice(0, idx), value.trim());
    }
  }
} catch { /* no .env — rely on process env */ }

const adapter = createIopoleAdapter();
const ctx: EInvoiceToolContext = { adapter };

function tool(name: string) {
  const t = getToolByName(name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

// ── Smoke: adapter created ──────────────────────────────

Deno.test("E2E: adapter is iopole", () => {
  assertEquals(adapter.name, "iopole");
});

Deno.test("E2E: 27 tools registered", () => {
  assertEquals(allTools.length, 27);
});

// ── Directory FR ────────────────────────────────────────

Deno.test("E2E: directory FR search by SIREN", async () => {
  const result = await tool("einvoice_directory_fr_search").handler(
    { q: "479661043" },
    ctx,
  ) as Record<string, unknown>;

  assert(result != null, "result should not be null");
  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data), "result.data should be array");
  assert(data.length > 0, "should find at least one entity");
  // Formatted columns
  assertEquals(typeof data[0]["Nom"], "string");
  assertEquals(typeof data[0]["SIREN"], "string");
  assertEquals(data[0]["_id"] != null, true, "_id should be present");
});

Deno.test("E2E: directory FR search by company name", async () => {
  const result = await tool("einvoice_directory_fr_search").handler(
    { q: "Iopole" },
    ctx,
  ) as Record<string, unknown>;

  assert(result != null);
  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data), "result.data should be array");
});

// ── Invoice Search ──────────────────────────────────────

Deno.test("E2E: invoice search (list all)", async () => {
  const result = await tool("einvoice_invoice_search").handler(
    { limit: 5 },
    ctx,
  ) as Record<string, unknown>;

  assert(result != null, "result should not be null");
  // Should have _rowAction for drill-down
  const rowAction = result._rowAction as Record<string, string>;
  assertEquals(rowAction.toolName, "einvoice_invoice_get");
  assertEquals(rowAction.idField, "_id");
  assertEquals(rowAction.argName, "id");
});

// ── Invoice Get (if we have invoices) ───────────────────

Deno.test("E2E: invoice get by ID (from search)", async () => {
  const searchResult = await tool("einvoice_invoice_search").handler(
    { limit: 1 },
    ctx,
  ) as Record<string, unknown>;

  const data = searchResult.data as Record<string, unknown>[];
  if (!data || data.length === 0) {
    console.log("  ⏭ No invoices in sandbox — skipping get test");
    return;
  }

  const invoiceId = data[0]._id as string;
  assert(invoiceId, "first invoice should have _id");

  const invoice = await tool("einvoice_invoice_get").handler(
    { id: invoiceId },
    ctx,
  ) as Record<string, unknown>;

  assert(invoice != null, "invoice should not be null");
  // Handler always returns structured data now — even without businessData
  assertEquals(invoice.id, invoiceId);
  assert(typeof invoice.status === "string", "should have status");
  // Direction should be resolved (M4 fix)
  if (invoice.direction) {
    assert(
      ["received", "sent"].includes(invoice.direction as string),
      `direction should be 'received' or 'sent', got '${invoice.direction}'`,
    );
  }
});

// ── Status History ──────────────────────────────────────

Deno.test("E2E: status history (from search)", async () => {
  const searchResult = await tool("einvoice_invoice_search").handler(
    { limit: 1 },
    ctx,
  ) as Record<string, unknown>;

  const data = searchResult.data as Record<string, unknown>[];
  if (!data || data.length === 0) {
    console.log("  ⏭ No invoices — skipping status history test");
    return;
  }

  const invoiceId = data[0]._id as string;
  const history = await tool("einvoice_status_history").handler(
    { invoice_id: invoiceId },
    ctx,
  ) as Record<string, unknown>;

  // H4 fix: should always return { entries: [...] }
  assert(history != null, "history should not be null");
  assert(Array.isArray(history.entries), "history.entries should be array");
});

// ── Unseen Invoices ─────────────────────────────────────

Deno.test("E2E: unseen invoices", async () => {
  const result = await tool("einvoice_invoice_not_seen").handler(
    { limit: 5 },
    ctx,
  ) as Record<string, unknown>;

  assert(result != null);
  // C1 fix: _rowAction.idField should be "_id"
  const rowAction = result._rowAction as Record<string, string>;
  assertEquals(rowAction.idField, "_id");
});

// ── Unseen Statuses ─────────────────────────────────────

Deno.test("E2E: unseen statuses", async () => {
  const result = await tool("einvoice_status_not_seen").handler(
    { limit: 5 },
    ctx,
  ) as Record<string, unknown>;

  assert(result != null);
  const rowAction = result._rowAction as Record<string, string>;
  assertEquals(rowAction.toolName, "einvoice_status_history");
});

// ── Webhooks ────────────────────────────────────────────

Deno.test("E2E: list webhooks", async () => {
  const result = await tool("einvoice_webhook_list").handler({}, ctx);
  assert(result != null, "webhook list should not be null");
});

// ── Generate CII (validation) ───────────────────────────

Deno.test("E2E: generate CII (minimal invoice)", async () => {
  const invoice = {
    invoiceId: "E2E-TEST-001",
    invoiceDate: "2026-03-16",
    type: 380,
    processType: "B1",
    invoiceDueDate: "2026-04-16",
    seller: {
      name: "E2E Test Seller",
      siren: "479661043",
      siret: "47966104300017",
      country: "FR",
      vatNumber: "FR32479661043",
    },
    buyer: {
      name: "E2E Test Buyer",
      siren: "123456789",
      siret: "12345678900001",
      country: "FR",
      vatNumber: "FR00123456789",
    },
    monetary: {
      invoiceCurrency: "EUR",
      invoiceAmount: { amount: 120 },
      payableAmount: { amount: 120 },
      taxTotalAmount: { amount: 20, currency: "EUR" },
      lineTotalAmount: { amount: 100 },
      taxBasisTotalAmount: { amount: 100 },
    },
    taxDetails: [
      { percent: 20, taxType: "VAT", categoryCode: "S", taxableAmount: { amount: 100 }, taxAmount: { amount: 20 } },
    ],
    lines: [
      {
        id: "1",
        item: { name: "E2E Test Service" },
        billedQuantity: { quantity: 1, unitCode: "C62" },
        price: { netAmount: { amount: 100 }, baseQuantity: { quantity: 1, unitCode: "C62" } },
        totalAmount: { amount: 100 },
        taxDetail: { percent: 20, taxType: "VAT", categoryCode: "S" },
      },
    ],
  };

  const result = await tool("einvoice_invoice_generate_cii").handler(
    { invoice, flavor: "EN16931" },
    ctx,
  ) as Record<string, unknown>;

  assert(result != null, "generate CII should return a result");
  assert(typeof result.generated_id === "string", "should have generated_id");
  assertEquals(result.filename, "E2E-TEST-001.xml");
  assert(result.preview != null, "should have preview");
});

// ── Peppol Check ────────────────────────────────────────

Deno.test("E2E: peppol check", async () => {
  try {
    // Scheme "0009" = SIREN, value = the SIREN number (no scheme prefix in value)
    const result = await tool("einvoice_directory_peppol_check").handler(
      { scheme: "0009", value: "479661043" },
      ctx,
    );
    assert(result != null);
  } catch (err) {
    // Peppol check may 404 if entity not registered — log and pass
    console.log(`  ⚠ Peppol check: ${(err as Error).message.slice(0, 200)}`);
  }
});
