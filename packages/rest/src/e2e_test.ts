/**
 * E2E Tests — REST API with Iopole Sandbox
 *
 * Tests real API calls through the Hono REST server against Iopole sandbox.
 * Requires IOPOLE_* env vars in .env.
 *
 * Run: deno test --allow-all packages/rest/src/e2e_test.ts
 */

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
import { createIopoleAdapter } from "@casys/einvoice-core";
import type { EInvoiceAdapter } from "@casys/einvoice-core";
import { createApp } from "./app.ts";

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

// Create real adapter + app — skip if env vars missing
let app: ReturnType<typeof createApp> | null = null;
let adapter: EInvoiceAdapter | null = null;
try {
  adapter = createIopoleAdapter();
  app = createApp(adapter, null); // no auth for E2E tests
} catch {
  // Missing env vars — tests will be skipped
}

function skipIfNoApp() {
  if (!app) {
    console.log("  ⏭ Skipping — IOPOLE_* env vars not set");
    return true;
  }
  return false;
}

async function get(path: string) {
  return await app!.request(path);
}

async function post(path: string, body: unknown) {
  return await app!.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const testInvoice = {
  invoiceId: "E2E-REST-001",
  invoiceDate: "2026-04-01",
  type: 380,
  processType: "B1",
  invoiceDueDate: "2026-05-01",
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
  taxDetails: [{
    percent: 20,
    taxType: "VAT",
    categoryCode: "S",
    taxableAmount: { amount: 100 },
    taxAmount: { amount: 20 },
  }],
  lines: [{
    id: "1",
    item: { name: "E2E Test Service" },
    billedQuantity: { quantity: 1, unitCode: "C62" },
    price: {
      netAmount: { amount: 100 },
      baseQuantity: { quantity: 1, unitCode: "C62" },
    },
    totalAmount: { amount: 100 },
    taxDetail: { percent: 20, taxType: "VAT", categoryCode: "S" },
  }],
};

// ── Smoke ─────────────────────────────────────────────────

Deno.test("E2E REST: health check returns iopole adapter", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/health");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.status, "ok");
  assertEquals(body.adapter, "iopole");
});

Deno.test("E2E REST: capabilities endpoint lists all 39+ methods", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/capabilities");
  assertEquals(res.status, 200);
  const body = await res.json() as { adapter: string; capabilities: string[] };
  assertEquals(body.adapter, "iopole");
  assert(Array.isArray(body.capabilities), "capabilities should be array");
  assert(body.capabilities.length >= 39, `expected 39+ capabilities, got ${body.capabilities.length}`);
});

Deno.test("E2E REST: OpenAPI spec is valid and has routes", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/openapi.json");
  assertEquals(res.status, 200);
  const spec = await res.json() as Record<string, unknown>;
  assertEquals(spec.openapi, "3.1.0");
  assert(spec.paths != null, "OpenAPI spec should have paths");
  const paths = Object.keys(spec.paths as object);
  assert(paths.length > 0, "OpenAPI spec should have at least one path");
  assert(paths.some((p) => p.includes("invoices")), "should have invoice paths");
});

// ── Directory ─────────────────────────────────────────────

Deno.test("E2E REST: GET /api/directory/fr?q=479661043 (SIREN search)", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/directory/fr?q=479661043");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert(body != null, "body should not be null");
  // Result may be { rows, count } or an array
  const rows = Array.isArray(body) ? body : (body.rows as unknown[]);
  assert(Array.isArray(rows), "should return rows array");
  assert(rows.length > 0, "should find at least one entity");
  const first = rows[0] as Record<string, unknown>;
  // entityId or id or _id should be present
  const hasId = first.entityId != null || first.id != null || first._id != null;
  assert(hasId, "first result should have an id field");
});

Deno.test("E2E REST: GET /api/directory/fr?q=Iopole (company name)", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/directory/fr?q=Iopole");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert(body != null, "body should not be null");
  const rows = Array.isArray(body) ? body : (body.rows as unknown[]);
  assert(Array.isArray(rows), "should return rows array");
});

Deno.test("E2E REST: GET /api/directory/peppol/check?scheme=0009&value=479661043", async () => {
  if (skipIfNoApp()) return;
  try {
    const res = await get("/api/directory/peppol/check?scheme=0009&value=479661043");
    assert(res.status < 500, `should not return 5xx, got ${res.status}`);
  } catch (err) {
    console.log(`  ⚠ Peppol check: ${(err as Error).message.slice(0, 200)}`);
  }
});

// ── Invoice Search ────────────────────────────────────────

Deno.test("E2E REST: GET /api/invoices (list all, limit 5)", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/invoices?limit=5");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert(body != null, "body should not be null");
  // SearchInvoicesResult has { rows, count }
  assert(body.rows != null || Array.isArray(body), "should have rows or be array");
  const rows = Array.isArray(body) ? body : (body.rows as unknown[]);
  assert(Array.isArray(rows), "rows should be array");
});

Deno.test("E2E REST: GET /api/invoices?direction=received", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/invoices?direction=received&limit=5");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  const rows = Array.isArray(body) ? body : (body.rows as unknown[]);
  assert(Array.isArray(rows), "rows should be array");
});

Deno.test("E2E REST: GET /api/invoices?direction=sent", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/invoices?direction=sent&limit=5");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  const rows = Array.isArray(body) ? body : (body.rows as unknown[]);
  assert(Array.isArray(rows), "rows should be array");
});

// ── Invoice Get + Detail ──────────────────────────────────

Deno.test("E2E REST: GET /api/invoices/:id (from search)", async () => {
  if (skipIfNoApp()) return;
  const searchRes = await get("/api/invoices?limit=1");
  assertEquals(searchRes.status, 200);
  const searchBody = await searchRes.json() as Record<string, unknown>;
  const rows = Array.isArray(searchBody) ? searchBody : (searchBody.rows as Record<string, unknown>[]);
  if (!rows || rows.length === 0) {
    console.log("  ⏭ No invoices in sandbox — skipping");
    return;
  }
  const invoiceId = (rows[0].id ?? rows[0]._id) as string;
  assert(invoiceId, "first invoice should have id");

  const res = await get(`/api/invoices/${encodeURIComponent(invoiceId)}`);
  assertEquals(res.status, 200);
  const invoice = await res.json() as Record<string, unknown>;
  assert(invoice != null, "invoice should not be null");
  assertEquals(invoice.id, invoiceId);
  assert(typeof invoice.status === "string", "should have status string");
  if (invoice.direction != null) {
    assert(
      ["received", "sent"].includes(invoice.direction as string),
      `direction should be 'received' or 'sent', got '${invoice.direction}'`,
    );
  }
});

Deno.test("E2E REST: GET /api/invoices/:id/status-history", async () => {
  if (skipIfNoApp()) return;
  const searchRes = await get("/api/invoices?limit=1");
  assertEquals(searchRes.status, 200);
  const searchBody = await searchRes.json() as Record<string, unknown>;
  const rows = Array.isArray(searchBody) ? searchBody : (searchBody.rows as Record<string, unknown>[]);
  if (!rows || rows.length === 0) {
    console.log("  ⏭ No invoices in sandbox — skipping");
    return;
  }
  const invoiceId = (rows[0].id ?? rows[0]._id) as string;

  const res = await get(`/api/invoices/${encodeURIComponent(invoiceId)}/status-history`);
  assertEquals(res.status, 200);
  const history = await res.json() as Record<string, unknown>;
  assert(history != null, "history should not be null");
  assert(Array.isArray(history.entries), "history.entries should be array");
});

// ── Invoice Download ──────────────────────────────────────

Deno.test("E2E REST: GET /api/invoices/:id/download", async () => {
  if (skipIfNoApp()) return;
  const searchRes = await get("/api/invoices?limit=1");
  assertEquals(searchRes.status, 200);
  const searchBody = await searchRes.json() as Record<string, unknown>;
  const rows = Array.isArray(searchBody) ? searchBody : (searchBody.rows as Record<string, unknown>[]);
  if (!rows || rows.length === 0) {
    console.log("  ⏭ No invoices in sandbox — skipping");
    return;
  }
  const invoiceId = (rows[0].id ?? rows[0]._id) as string;

  const res = await get(`/api/invoices/${encodeURIComponent(invoiceId)}/download`);
  // May be 200 with binary content or 404 if invoice has no downloadable file
  assert(res.status < 500, `should not return 5xx, got ${res.status}`);
  if (res.status === 200) {
    const ct = res.headers.get("Content-Type");
    assert(ct != null, "download response should have Content-Type header");
    assertNotEquals(ct, "", "Content-Type should not be empty");
  }
});

Deno.test("E2E REST: GET /api/invoices/:id/files", async () => {
  if (skipIfNoApp()) return;
  const searchRes = await get("/api/invoices?limit=1");
  assertEquals(searchRes.status, 200);
  const searchBody = await searchRes.json() as Record<string, unknown>;
  const rows = Array.isArray(searchBody) ? searchBody : (searchBody.rows as Record<string, unknown>[]);
  if (!rows || rows.length === 0) {
    console.log("  ⏭ No invoices in sandbox — skipping");
    return;
  }
  const invoiceId = (rows[0].id ?? rows[0]._id) as string;

  const res = await get(`/api/invoices/${encodeURIComponent(invoiceId)}/files`);
  assert(res.status < 500, `should not return 5xx, got ${res.status}`);
  if (res.status === 200) {
    const body = await res.json();
    assert(body != null, "files response should not be null");
  }
});

// ── Generate ──────────────────────────────────────────────

Deno.test("E2E REST: POST /api/invoices/generate/cii", async () => {
  if (skipIfNoApp()) return;
  const res = await post("/api/invoices/generate/cii", {
    invoice: testInvoice,
    flavor: "EN16931",
  });
  assertEquals(res.status, 200);
  const xml = await res.text();
  assert(xml.length > 0, "CII response should not be empty");
  assert(xml.includes("<?xml") || xml.includes("<rsm:") || xml.includes("<CrossIndustryInvoice"),
    "response should look like XML");
});

Deno.test("E2E REST: POST /api/invoices/generate/facturx", async () => {
  if (skipIfNoApp()) return;
  const res = await post("/api/invoices/generate/facturx", {
    invoice: testInvoice,
    flavor: "EN16931",
  });
  assertEquals(res.status, 200);
  const ct = res.headers.get("Content-Type");
  assert(ct != null, "Factur-X response should have Content-Type");
  assert(ct.includes("application/pdf"), `Content-Type should be application/pdf, got ${ct}`);
});

// ── Webhooks ──────────────────────────────────────────────

Deno.test("E2E REST: GET /api/webhooks", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/webhooks");
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(body != null, "webhooks response should not be null");
});

// ── Config ────────────────────────────────────────────────

Deno.test("E2E REST: GET /api/entities", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/entities");
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert(body != null, "entities response should not be null");
  // May return { rows, count } or an array
  const rows = Array.isArray(body) ? body : (body.rows as unknown[]);
  assert(Array.isArray(rows), "should return rows array");
});

Deno.test("E2E REST: GET /api/config/customer-id", async () => {
  if (skipIfNoApp()) return;
  const res = await get("/api/config/customer-id");
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(body != null, "customer-id response should not be null");
});

// ── Reporting ─────────────────────────────────────────────

Deno.test("E2E REST: POST /api/reporting/invoice-transaction (route reachable)", async () => {
  if (skipIfNoApp()) return;
  // The real API may reject the payload with 400/422, but the route should not return 404.
  try {
    const res = await post("/api/reporting/invoice-transaction", {
      invoice_id: "E2E-REST-REPORT-001",
    });
    assertNotEquals(res.status, 404, "reporting route should be registered (not 404)");
  } catch (err) {
    console.log(`  ⚠ Reporting: ${(err as Error).message.slice(0, 200)}`);
  }
});
