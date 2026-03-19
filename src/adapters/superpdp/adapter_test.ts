/**
 * SuperPDPAdapter Tests
 *
 * Tests that SuperPDPAdapter correctly translates adapter method calls
 * to Super PDP native API endpoints, and that AFNOR-inherited methods
 * call the AFNOR flow endpoints.
 *
 * @module lib/einvoice/src/adapters/superpdp/adapter_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { SuperPDPAdapter } from "./adapter.ts";
import { SuperPDPClient } from "./client.ts";
import { AfnorClient } from "../afnor/client.ts";
import { mockFetch } from "../../testing/helpers.ts";

function makeAdapter() {
  const client = new SuperPDPClient({
    baseUrl: "https://api.superpdp.tech/v1.beta",
    getToken: () => Promise.resolve("test-token"),
  });
  const afnor = new AfnorClient({
    baseUrl: "https://api.superpdp.tech/afnor-flow",
    getToken: () => Promise.resolve("test-token"),
  });
  return new SuperPDPAdapter(client, afnor);
}

// ── Identity ─────────────────────────────────────────────

Deno.test("SuperPDPAdapter - name is 'superpdp'", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.name, "superpdp");
});

Deno.test("SuperPDPAdapter - capabilities contains 22 methods", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.capabilities.size, 22);
  // Core native
  assertEquals(adapter.capabilities.has("emitInvoice"), true);
  assertEquals(adapter.capabilities.has("searchInvoices"), true);
  assertEquals(adapter.capabilities.has("generateCII"), true);
  // AFNOR inherited
  assertEquals(adapter.capabilities.has("reportInvoiceTransaction"), true);
  assertEquals(adapter.capabilities.has("reportTransaction"), true);
  // Not supported
  assertEquals(adapter.capabilities.has("downloadReadable"), false);
  assertEquals(adapter.capabilities.has("listWebhooks"), false);
});

// ── Invoice Operations (native) ─────────────────────────

Deno.test("SuperPDPAdapter.emitInvoice() - POST /invoices with XML", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "inv-new" } },
  ]);

  try {
    const adapter = makeAdapter();
    const file = new Uint8Array([0x3C, 0x3F, 0x78, 0x6D, 0x6C]); // <?xml
    await adapter.emitInvoice({ file, filename: "invoice.xml" });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoices");
    assertEquals(url.searchParams.get("external_id"), "invoice.xml");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.searchInvoices() - GET /invoices", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [], count: 0 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchInvoices({ q: "incoming", limit: 10 });

    assertEquals(captured[0].method, "GET");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoices");
    assertEquals(url.searchParams.get("limit"), "10");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.getInvoice() - GET /invoices/{id}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "inv-1", status: "delivered" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getInvoice("inv-1");

    assertEquals(result, { id: "inv-1", status: "delivered" });
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/invoices/inv-1");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.downloadInvoice() - GET /invoices/{id}/download", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<xml/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    const { contentType } = await adapter.downloadInvoice("inv-1");

    assertEquals(contentType, "application/xml");
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/invoices/inv-1/download");
  } finally {
    restore();
  }
});

// ── Format Conversion (native) ──────────────────────────

Deno.test("SuperPDPAdapter.generateCII() - POST /invoices/convert?to=cii", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<cii:invoice/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateCII({ invoice: { invoiceId: "F-001" }, flavor: "EN16931" });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoices/convert");
    assertEquals(url.searchParams.get("to"), "cii");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.generateFacturX() - POST /invoices/convert?to=facturx", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<facturx/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateFacturX({ invoice: { invoiceId: "F-002" }, flavor: "EN16931" });

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.get("to"), "facturx");
  } finally {
    restore();
  }
});

// ── Status / Events (native) ────────────────────────────

Deno.test("SuperPDPAdapter.sendStatus() - POST /invoice_events", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "evt-1" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.sendStatus({
      invoiceId: "inv-1",
      code: "fr:212",
      message: "Approuvée",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/invoice_events");
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.invoice_id, "inv-1");
    assertEquals(body.status_code, "fr:212");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.getStatusHistory() - GET /invoice_events?invoice_id=xxx", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [{ id: "evt-1" }] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getStatusHistory("inv-1");

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoice_events");
    assertEquals(url.searchParams.get("invoice_id"), "inv-1");
  } finally {
    restore();
  }
});

// ── Reporting (AFNOR inherited) ─────────────────────────

Deno.test("SuperPDPAdapter.reportInvoiceTransaction() - calls AFNOR flow API", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "flow-1" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.reportInvoiceTransaction({ amount: 1000, type: "B2C" });

    assertEquals(captured[0].method, "POST");
    // Should hit the AFNOR base URL, not the native API
    assertEquals(captured[0].url.includes("afnor-flow"), true);
    assertEquals(captured[0].url.includes("/v1/flows"), true);
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.reportTransaction() - calls AFNOR flow API", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "flow-2" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.reportTransaction("entity-1", { amount: 500 });

    assertEquals(captured[0].url.includes("afnor-flow"), true);
  } finally {
    restore();
  }
});

// ── Directory (native) ──────────────────────────────────

Deno.test("SuperPDPAdapter.searchDirectoryFr() - GET /directory_entries", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchDirectoryFr({ q: "test" });

    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/directory_entries");
  } finally {
    restore();
  }
});

// ── Config (native) ─────────────────────────────────────

Deno.test("SuperPDPAdapter.getCustomerId() - GET /companies/me", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "company-1", name: "Test Corp" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getCustomerId();

    assertEquals(result, { id: "company-1", name: "Test Corp" });
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/companies/me");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.unregisterNetwork() - DELETE /directory_entries/{id}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.unregisterNetwork("de-123");

    assertEquals(captured[0].method, "DELETE");
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/directory_entries/de-123");
  } finally {
    restore();
  }
});

// ── Stubs (inherited NotSupportedError) ─────────────────

Deno.test("SuperPDPAdapter.downloadReadable() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.downloadReadable("inv-1"),
    Error,
    "not covered by AFNOR",
  );
});

Deno.test("SuperPDPAdapter.listWebhooks() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.listWebhooks(),
    Error,
    "not covered by AFNOR",
  );
});

Deno.test("SuperPDPAdapter.createWebhook() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.createWebhook({ url: "http://test", events: [] }),
    Error,
    "not covered by AFNOR",
  );
});

Deno.test("SuperPDPAdapter.listBusinessEntities() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.listBusinessEntities(),
    Error,
    "not covered by AFNOR",
  );
});
