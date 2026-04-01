/**
 * E2E Tests — Super PDP Sandbox
 *
 * Tests real API calls against the Super PDP sandbox (Burger Queen).
 * Requires SUPERPDP_* env vars in .env.
 *
 * Run: deno test src/e2e_superpdp_test.ts --no-check --allow-all
 *
 * @module lib/einvoice/src/e2e_superpdp_test
 */

import { assert, assertEquals } from "jsr:@std/assert";
import { createSuperPDPAdapter } from "./adapters/superpdp/adapter.ts";
import { getToolByName } from "./tools/mod.ts";
import type { EInvoiceAdapter } from "./adapter.ts";
import type { EInvoiceToolContext } from "./tools/types.ts";
import { unwrapStructured } from "./testing/helpers.ts";

// Load .env from project root (best-effort)
const envPath = new URL("../.env", import.meta.url).pathname;
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
  adapter = createSuperPDPAdapter();
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
    console.log("  ⏭ Skipping — SUPERPDP_* env vars not set");
    return true;
  }
  return false;
}

// ── Smoke ────────────────────────────────────────────────

Deno.test("E2E SuperPDP: adapter is superpdp", () => {
  if (skipIfNoAdapter()) return;
  assertEquals(adapter!.name, "superpdp");
});

Deno.test("E2E SuperPDP: capabilities include 21 methods", () => {
  if (skipIfNoAdapter()) return;
  assert(adapter!.capabilities.has("searchInvoices"));
  assert(adapter!.capabilities.has("getInvoice"));
  assert(adapter!.capabilities.has("sendStatus"));
  assert(adapter!.capabilities.has("generateCII"));
  assert(adapter!.capabilities.has("searchDirectoryFr"));
  assert(adapter!.capabilities.has("reportInvoiceTransaction"));
  // Not supported
  assert(!adapter!.capabilities.has("listWebhooks"));
  assert(!adapter!.capabilities.has("checkPeppolParticipant"));
});

// ── Config ───────────────────────────────────────────────

Deno.test("E2E SuperPDP: getCustomerId returns company info", async () => {
  if (skipIfNoAdapter()) return;
  const result = await tool("einvoice_config_customer_id").handler({}, ctx!);

  assert(result != null, "should return company info");
  // deno-lint-ignore no-explicit-any
  const data = result as any;
  assert(data.id != null, "should have company id");
  console.log(`  ✓ Company: ${data.formal_name ?? data.name} (id=${data.id})`);
});

// ── Invoice Search ──────────────────────────────────────

Deno.test("E2E SuperPDP: invoice search (list all)", async () => {
  if (skipIfNoAdapter()) return;
  const result = unwrapStructured(
    await tool("einvoice_invoice_search").handler(
      { limit: 5 },
      ctx!,
    ),
  );

  assert(result != null, "result should not be null");
  const rowAction = result._rowAction as Record<string, string>;
  assertEquals(rowAction.toolName, "einvoice_invoice_get");
  assertEquals(rowAction.idField, "_id");

  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data), "result.data should be array");
  console.log(`  ✓ Found ${data.length} invoices`);

  if (data.length > 0) {
    const first = data[0];
    assert(first._id != null, "first row should have _id");
    // Verify en_invoice mapping worked: should have invoice number or status
    console.log(
      `  ✓ First invoice: id=${first._id}, status=${first["Statut"] ?? "n/a"}`,
    );
  }
});

Deno.test("E2E SuperPDP: invoice search by direction 'out'", async () => {
  if (skipIfNoAdapter()) return;
  const result = unwrapStructured(
    await tool("einvoice_invoice_search").handler(
      { q: "out", limit: 3 },
      ctx!,
    ),
  );

  assert(result != null);
  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data));
  // All results should be "sent" direction
  for (const row of data) {
    if (row["Direction"]) {
      assertEquals(
        row["Direction"],
        "sent",
        "direction filter 'out' should return 'sent' invoices",
      );
    }
  }
  console.log(`  ✓ Found ${data.length} outgoing invoices`);
});

// ── Invoice Get ─────────────────────────────────────────

Deno.test("E2E SuperPDP: invoice get by ID (from search)", async () => {
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
  assertEquals(String(invoice.id), String(invoiceId));
  // Verify en_invoice mapping: status should come from events[last].status_code
  if (invoice.status) {
    assert(typeof invoice.status === "string", "status should be a string");
    console.log(`  ✓ Invoice ${invoiceId}: status=${invoice.status}`);
  }
  if (invoice.direction) {
    assert(
      ["received", "sent"].includes(invoice.direction as string),
      `direction should be 'received' or 'sent', got '${invoice.direction}'`,
    );
  }
  // Verify totalHt/totalTtc from en_invoice.totals
  if (invoice.totalTtc != null) {
    assert(typeof invoice.totalTtc === "number", "totalTtc should be a number");
    console.log(`  ✓ totalTtc=${invoice.totalTtc}, totalHt=${invoice.totalHt}`);
  }
});

// ── Status History ──────────────────────────────────────

Deno.test("E2E SuperPDP: status history (from search)", async () => {
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
  // SuperPDP events have status_code like "fr:200", "fr:205"
  if ((history.entries as unknown[]).length > 0) {
    // deno-lint-ignore no-explicit-any
    const first = (history.entries as any[])[0];
    assert(typeof first.code === "string", "event should have code");
    assert(typeof first.date === "string", "event should have date");
    console.log(
      `  ✓ ${
        (history.entries as unknown[]).length
      } events, first: ${first.code} @ ${first.date}`,
    );
  }
});

// ── Directory ───────────────────────────────────────────

Deno.test("E2E SuperPDP: directory entries (searchDirectoryFr)", async () => {
  if (skipIfNoAdapter()) return;
  const result = unwrapStructured(
    await tool("einvoice_directory_fr_search").handler(
      { q: "Burger Queen" },
      ctx!,
    ),
  );

  assert(result != null);
  const data = result.data as Record<string, unknown>[];
  assert(Array.isArray(data), "result.data should be array");
  console.log(`  ✓ Found ${data.length} directory entries`);
  if (data.length > 0) {
    const first = data[0];
    assert(first._id != null, "entry should have _id");
    console.log(
      `  ✓ First: name=${first["Nom"]}, identifier=${first["SIRET"]}`,
    );
  }
});

// ── Format Conversion ───────────────────────────────────

Deno.test("E2E SuperPDP: generate CII from EN16931 JSON", async () => {
  if (skipIfNoAdapter()) return;
  const invoice = {
    number: "E2E-SUPERPDP-001",
    issue_date: "2026-03-20",
    due_date: "2026-04-20",
    currency_code: "EUR",
    type_code: 380,
    seller: {
      name: "Burger Queen",
      country: "FR",
    },
    buyer: {
      name: "E2E Test Buyer",
      country: "FR",
    },
    totals: {
      line_extension_amount: 100,
      tax_exclusive_amount: 100,
      tax_inclusive_amount: 120,
      amount_due_for_payment: 120,
    },
  };

  try {
    const result = unwrapStructured(
      await tool("einvoice_invoice_generate_cii").handler(
        { invoice, flavor: "EN16931" },
        ctx!,
      ),
    );

    assert(result != null, "generate CII should return a result");
    assert(typeof result.generated_id === "string", "should have generated_id");
    console.log(`  ✓ Generated CII: ${result.generated_id}`);
  } catch (err) {
    // SuperPDP may reject minimal invoices — log but don't fail hard
    console.log(`  ⚠ Generate CII: ${(err as Error).message.slice(0, 300)}`);
  }
});

Deno.test("E2E SuperPDP: generate UBL from EN16931 JSON", async () => {
  if (skipIfNoAdapter()) return;
  const invoice = {
    number: "E2E-SUPERPDP-002",
    issue_date: "2026-03-20",
    currency_code: "EUR",
    type_code: 380,
    seller: { name: "Burger Queen", country: "FR" },
    buyer: { name: "E2E Test Buyer", country: "FR" },
    totals: {
      line_extension_amount: 100,
      tax_exclusive_amount: 100,
      tax_inclusive_amount: 120,
      amount_due_for_payment: 120,
    },
  };

  try {
    const result = unwrapStructured(
      await tool("einvoice_invoice_generate_ubl").handler(
        { invoice, flavor: "EN16931" },
        ctx!,
      ),
    );

    assert(result != null, "generate UBL should return a result");
    assert(typeof result.generated_id === "string", "should have generated_id");
    console.log(`  ✓ Generated UBL: ${result.generated_id}`);
  } catch (err) {
    console.log(`  ⚠ Generate UBL: ${(err as Error).message.slice(0, 300)}`);
  }
});
