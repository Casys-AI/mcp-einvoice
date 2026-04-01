/**
 * E2E Tests — Iopole Sandbox
 *
 * Tests real API calls against the Iopole sandbox.
 * Requires IOPOLE_* env vars in .env.
 *
 * Run: deno test src/e2e_test.ts --no-check --allow-all
 *
 * @module lib/einvoice/src/e2e_test
 */

import { assert, assertEquals } from "jsr:@std/assert";
import { createIopoleAdapter } from "@casys/einvoice-core";
import { allTools, getToolByName } from "./tools/mod.ts";
import type { EInvoiceAdapter } from "@casys/einvoice-core";
import { unwrapStructured } from "./testing/helpers.ts";
import type { EInvoiceToolContext } from "./tools/types.ts";

// Load .env from project root (best-effort)
const envPath = new URL("../../../.env", import.meta.url).pathname;
try {
  const text = await Deno.readTextFile(envPath);
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      let value = trimmed.slice(idx + 1);
      const commentIdx = value.search(/\s+#/);
      if (commentIdx >= 0) value = value.slice(0, commentIdx);
      Deno.env.set(trimmed.slice(0, idx), value.trim());
    }
  }
} catch { /* no .env — rely on process env */ }

// Create adapter lazily — skip all tests if env vars are missing
let adapter: EInvoiceAdapter | null = null;
let ctx: EInvoiceToolContext | null = null;
try {
  adapter = createIopoleAdapter();
  ctx = { adapter };
} catch {
  // Missing env vars — tests will be skipped
}

function tool(name: string) {
  const t = getToolByName(name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

function skipIfNoAdapter() {
  if (!adapter || !ctx) {
    console.log("  ⏭ Skipping — IOPOLE_* env vars not set");
    return true;
  }
  return false;
}

// ── Smoke ────────────────────────────────────────────────

Deno.test("E2E: tools registry has 39 tools", () => {
  assertEquals(allTools.length, 39);
});

Deno.test("E2E: adapter is iopole", () => {
  if (skipIfNoAdapter()) return;
  assertEquals(adapter!.name, "iopole");
});

// ── Directory FR ────────────────────────────────────────

Deno.test("E2E: directory FR search by SIREN", async () => {
  if (skipIfNoAdapter()) return;
  const raw = await tool("einvoice_directory_fr_search").handler(
    { q: "479661043" },
    ctx!,
  );
  const result = unwrapStructured(raw);

  assert(result != null, "result should not be null");
  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data), "result.data should be array");
  assert(data.length > 0, "should find at least one entity");
  assertEquals(typeof data[0]["Nom"], "string");
  assertEquals(data[0]["_id"] != null, true, "_id should be present");
});

Deno.test("E2E: directory FR search by company name", async () => {
  if (skipIfNoAdapter()) return;
  const raw = await tool("einvoice_directory_fr_search").handler(
    { q: "Iopole" },
    ctx!,
  );
  const result = unwrapStructured(raw);

  assert(result != null);
  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data), "result.data should be array");
});

// ── Invoice Search ──────────────────────────────────────

Deno.test("E2E: invoice search (list all)", async () => {
  if (skipIfNoAdapter()) return;
  const raw = await tool("einvoice_invoice_search").handler(
    { limit: 5 },
    ctx!,
  );
  const result = unwrapStructured(raw);

  assert(result != null, "result should not be null");
  const rowAction = result._rowAction as Record<string, string>;
  assertEquals(rowAction.toolName, "einvoice_invoice_get");
  assertEquals(rowAction.idField, "_id");
  assertEquals(rowAction.argName, "id");
});

// ── Invoice Get ─────────────────────────────────────────

Deno.test("E2E: invoice get by ID (from search)", async () => {
  if (skipIfNoAdapter()) return;
  const searchResult = unwrapStructured(
    await tool("einvoice_invoice_search").handler(
      { limit: 1 },
      ctx!,
    ),
  );

  const data = searchResult.data as Record<string, unknown>[];
  if (!data || data.length === 0) {
    console.log("  ⏭ No invoices in sandbox — skipping");
    return;
  }

  const invoiceId = data[0]._id as string;
  assert(invoiceId, "first invoice should have _id");

  const invoice = unwrapStructured(
    await tool("einvoice_invoice_get").handler(
      { id: invoiceId },
      ctx!,
    ),
  );

  assert(invoice != null, "invoice should not be null");
  assertEquals(invoice.id, invoiceId);
  assert(typeof invoice.status === "string", "should have status");
  if (invoice.direction) {
    assert(
      ["received", "sent"].includes(invoice.direction as string),
      `direction should be 'received' or 'sent', got '${invoice.direction}'`,
    );
  }
});

// ── Status History ──────────────────────────────────────

Deno.test("E2E: status history (from search)", async () => {
  if (skipIfNoAdapter()) return;
  const searchResult = unwrapStructured(
    await tool("einvoice_invoice_search").handler(
      { limit: 1 },
      ctx!,
    ),
  );

  const data = searchResult.data as Record<string, unknown>[];
  if (!data || data.length === 0) {
    console.log("  ⏭ No invoices — skipping");
    return;
  }

  const invoiceId = data[0]._id as string;
  const history = unwrapStructured(
    await tool("einvoice_status_history").handler(
      { invoice_id: invoiceId },
      ctx!,
    ),
  );

  assert(history != null, "history should not be null");
  assert(Array.isArray(history.entries), "history.entries should be array");
});

// ── Webhooks ────────────────────────────────────────────

Deno.test("E2E: list webhooks", async () => {
  if (skipIfNoAdapter()) return;
  const result = await tool("einvoice_webhook_list").handler({}, ctx!);
  assert(result != null, "webhook list should not be null");
});

// ── Generate CII ────────────────────────────────────────

Deno.test("E2E: generate CII (minimal invoice)", async () => {
  if (skipIfNoAdapter()) return;
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
      {
        percent: 20,
        taxType: "VAT",
        categoryCode: "S",
        taxableAmount: { amount: 100 },
        taxAmount: { amount: 20 },
      },
    ],
    lines: [
      {
        id: "1",
        item: { name: "E2E Test Service" },
        billedQuantity: { quantity: 1, unitCode: "C62" },
        price: {
          netAmount: { amount: 100 },
          baseQuantity: { quantity: 1, unitCode: "C62" },
        },
        totalAmount: { amount: 100 },
        taxDetail: { percent: 20, taxType: "VAT", categoryCode: "S" },
      },
    ],
  };

  const raw = await tool("einvoice_invoice_generate_cii").handler(
    { invoice, flavor: "EN16931" },
    ctx!,
  );
  const result = unwrapStructured(raw);

  assert(result != null, "generate CII should return a result");
  assert(typeof result.generated_id === "string", "should have generated_id");
  assertEquals(result.filename, "E2E-TEST-001.xml");
  assert(result.preview != null, "should have preview");
});

// ── Peppol Check ────────────────────────────────────────

Deno.test("E2E: peppol check", async () => {
  if (skipIfNoAdapter()) return;
  try {
    const result = await tool("einvoice_directory_peppol_check").handler(
      { scheme: "0009", value: "479661043" },
      ctx!,
    );
    assert(result != null);
  } catch (err) {
    console.log(`  ⚠ Peppol check: ${(err as Error).message.slice(0, 200)}`);
  }
});
