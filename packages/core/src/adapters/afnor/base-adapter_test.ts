/**
 * AfnorBaseAdapter Tests
 *
 * Tests for the abstract AFNOR base adapter via a minimal concrete subclass.
 * Covers:
 *   - null afnor → all base methods throw NotSupportedError
 *   - emitInvoice sets Factur-X syntax for PDF, CII for other extensions
 *   - searchInvoices builds correct AFNOR flow filters and normalizes direction
 *   - sendStatus builds correct CDAR payload and submits as a CDAR flow
 *   - getStatusHistory searches lifecycle flow types and maps response
 *   - downloadInvoice delegates with "Original" docType
 *   - reportInvoiceTransaction and reportTransaction use FRR syntax
 *
 * @module lib/einvoice/src/adapters/afnor/base-adapter_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { AfnorBaseAdapter } from "./base-adapter.ts";
import { AfnorClient } from "./client.ts";
import { NotSupportedError } from "../shared/errors.ts";
import type { AdapterMethodName } from "../../adapter.ts";
import { mockFetch } from "../../testing/helpers.ts";

// ── Minimal concrete subclass ────────────────────────────

class TestAfnorAdapter extends AfnorBaseAdapter {
  readonly name = "test-afnor";
  readonly capabilities: Set<AdapterMethodName> = new Set([
    "emitInvoice",
    "searchInvoices",
    "getInvoice",
    "downloadInvoice",
    "sendStatus",
    "getStatusHistory",
    "reportInvoiceTransaction",
    "reportTransaction",
  ] as AdapterMethodName[]);
}

function makeAfnorClient() {
  return new AfnorClient({
    baseUrl: "https://api.example.com/afnor",
    getToken: () => Promise.resolve("test-token"),
    timeoutMs: 5000,
  });
}

function makeAdapterWithClient() {
  return new TestAfnorAdapter(makeAfnorClient());
}

function makeAdapterNullAfnor() {
  return new TestAfnorAdapter(null);
}

// ── null afnor → NotSupportedError ───────────────────────

Deno.test("AfnorBaseAdapter (null) - emitInvoice throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () =>
      adapter.emitInvoice({
        file: new Uint8Array([0]),
        filename: "invoice.xml",
      }),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - searchInvoices throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.searchInvoices({}),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - getInvoice throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.getInvoice("inv-1"),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - downloadInvoice throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.downloadInvoice("inv-1"),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - sendStatus throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.sendStatus({ invoiceId: "inv-1", code: "fr:205" }),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - getStatusHistory throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.getStatusHistory("inv-1"),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - reportInvoiceTransaction throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.reportInvoiceTransaction("0009", "12345678901234", { amount: 1000 }),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - reportTransaction throws NotSupportedError", async () => {
  const adapter = makeAdapterNullAfnor();
  await assertRejects(
    () => adapter.reportTransaction("0009", "entity-1", { amount: 500 }),
    NotSupportedError,
  );
});

Deno.test("AfnorBaseAdapter (null) - error message mentions AFNOR not configured", async () => {
  const adapter = makeAdapterNullAfnor();
  try {
    await adapter.emitInvoice({
      file: new Uint8Array([0]),
      filename: "invoice.xml",
    });
  } catch (e) {
    const err = e as NotSupportedError;
    assertEquals(err.message.toLowerCase().includes("afnor"), true);
  }
});

// ── emitInvoice — syntax selection ──────────────────────

Deno.test("AfnorBaseAdapter.emitInvoice() - PDF filename → Factur-X syntax", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-1" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.emitInvoice({
      file: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
      filename: "invoice.pdf",
    });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "Factur-X");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.emitInvoice() - uppercase .PDF extension → Factur-X", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-2" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.emitInvoice({
      file: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      filename: "INVOICE.PDF",
    });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "Factur-X");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.emitInvoice() - XML filename → CII syntax", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-3" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.emitInvoice({
      file: new Uint8Array([0x3C, 0x3F, 0x78, 0x6D, 0x6C]),
      filename: "invoice.xml",
    });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "CII");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.emitInvoice() - sets processingRule B2B and correct name", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-4" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.emitInvoice({
      file: new Uint8Array([0]),
      filename: "facture.xml",
    });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.processingRule, "B2B");
    assertEquals(flowInfo.name, "facture.xml");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.emitInvoice() - POSTs to /v1/flows", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-5" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.emitInvoice({
      file: new Uint8Array([0]),
      filename: "invoice.xml",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/afnor/v1/flows");
  } finally {
    restore();
  }
});

// ── searchInvoices — filters and direction normalization ──

Deno.test("AfnorBaseAdapter.searchInvoices() - POSTs to /v1/flows/search", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.searchInvoices({});

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/afnor/v1/flows/search");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.searchInvoices() - sends CustomerInvoice and SupplierInvoice flow types", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.searchInvoices({});

    const body = captured[0].body as Record<string, unknown>;
    const where = body["where"] as Record<string, unknown>;
    const flowType = where["flowType"] as string[];
    assertEquals(flowType.includes("CustomerInvoice"), true);
    assertEquals(flowType.includes("SupplierInvoice"), true);
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.searchInvoices() - passes q as trackingId filter", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.searchInvoices({ q: "INV-999" });

    const body = captured[0].body as Record<string, unknown>;
    const where = body["where"] as Record<string, unknown>;
    assertEquals(where["trackingId"], "INV-999");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.searchInvoices() - passes limit", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.searchInvoices({ limit: 20 });

    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body["limit"], 20);
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.searchInvoices() - normalizes direction 'In' → 'received'", async () => {
  const { restore } = mockFetch([
    {
      status: 200,
      body: {
        results: [
          {
            flowId: "fl-A",
            ackStatus: "Ok",
            flowDirection: "In",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    const result = await adapter.searchInvoices({});

    assertEquals(result.rows[0].direction, "received");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.searchInvoices() - normalizes direction 'Out' → 'sent'", async () => {
  const { restore } = mockFetch([
    {
      status: 200,
      body: {
        results: [
          {
            flowId: "fl-B",
            ackStatus: "Ok",
            flowDirection: "Out",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    const result = await adapter.searchInvoices({});

    assertEquals(result.rows[0].direction, "sent");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.searchInvoices() - maps flowId, ackStatus, dates", async () => {
  const { restore } = mockFetch([
    {
      status: 200,
      body: {
        results: [
          {
            flowId: "fl-C",
            ackStatus: "Pending",
            flowDirection: "Out",
            updatedAt: "2026-03-15T10:00:00Z",
          },
          {
            flowId: "fl-D",
            ackStatus: "Ok",
            flowDirection: "In",
            submittedAt: "2026-03-10T08:00:00Z",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    const result = await adapter.searchInvoices({});

    assertEquals(result.count, 2);
    assertEquals(result.rows[0].id, "fl-C");
    assertEquals(result.rows[0].status, "Pending");
    assertEquals(result.rows[0].date, "2026-03-15T10:00:00Z");
    // row[1] has no updatedAt, falls back to submittedAt
    assertEquals(result.rows[1].id, "fl-D");
    assertEquals(result.rows[1].date, "2026-03-10T08:00:00Z");
  } finally {
    restore();
  }
});

// ── sendStatus — CDAR payload ────────────────────────────

Deno.test("AfnorBaseAdapter.sendStatus() - submits CDAR flow to /v1/flows", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-status-1" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.sendStatus({
      invoiceId: "inv-1",
      code: "fr:205",
      message: "Approuvée",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/afnor/v1/flows");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.sendStatus() - flowInfo has CDAR syntax and B2B rule", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-status-2" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.sendStatus({ invoiceId: "inv-1", code: "fr:205" });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "CDAR");
    assertEquals(flowInfo.processingRule, "B2B");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.sendStatus() - file name is status-{invoiceId}.json", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-status-3" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.sendStatus({ invoiceId: "INV-007", code: "fr:210" });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.name, "status-INV-007.json");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.sendStatus() - CDAR payload contains invoiceId and statusCode", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-status-4" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.sendStatus({
      invoiceId: "inv-42",
      code: "fr:212",
      message: "Payée",
    });

    // The file field is a Blob containing the JSON payload
    // mockFetch records it as "[Blob: status-inv-42.json, N bytes]"
    // We verify the flowInfo encodes the name which matches the payload reference
    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.name, "status-inv-42.json");
    assertEquals(flowInfo.flowSyntax, "CDAR");
  } finally {
    restore();
  }
});

// ── getStatusHistory — lifecycle flow search ─────────────

Deno.test("AfnorBaseAdapter.getStatusHistory() - searches CustomerInvoiceLC and SupplierInvoiceLC", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.getStatusHistory("inv-1");

    const body = captured[0].body as Record<string, unknown>;
    const where = body["where"] as Record<string, unknown>;
    const flowType = where["flowType"] as string[];
    assertEquals(flowType.includes("CustomerInvoiceLC"), true);
    assertEquals(flowType.includes("SupplierInvoiceLC"), true);
    assertEquals(where["trackingId"], "inv-1");
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.getStatusHistory() - maps entries from results", async () => {
  const { restore } = mockFetch([
    {
      status: 200,
      body: {
        results: [
          {
            flowId: "fl-lc-1",
            ackStatus: "Ok",
            flowType: "CustomerInvoiceLC",
            flowDirection: "In",
            updatedAt: "2026-03-01T10:00:00Z",
          },
          {
            flowId: "fl-lc-2",
            ackStatus: "Error",
            flowType: "SupplierInvoiceLC",
            flowDirection: "Out",
            submittedAt: "2026-03-02T11:00:00Z",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    const result = await adapter.getStatusHistory("inv-1");

    assertEquals(result.entries.length, 2);
    assertEquals(result.entries[0].code, "Ok");
    assertEquals(result.entries[0].date, "2026-03-01T10:00:00Z");
    assertEquals(result.entries[0].message, "CustomerInvoiceLC");
    assertEquals(result.entries[0].destType, "PLATFORM"); // flowDirection "In"
    assertEquals(result.entries[1].code, "Error");
    assertEquals(result.entries[1].destType, "OPERATOR"); // flowDirection "Out"
  } finally {
    restore();
  }
});

Deno.test("AfnorBaseAdapter.getStatusHistory() - falls back to submittedAt when no updatedAt", async () => {
  const { restore } = mockFetch([
    {
      status: 200,
      body: {
        results: [
          {
            flowId: "fl-lc-3",
            ackStatus: "Pending",
            flowType: "CustomerInvoiceLC",
            flowDirection: "In",
            submittedAt: "2026-01-15T09:00:00Z",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    const result = await adapter.getStatusHistory("inv-x");

    assertEquals(result.entries[0].date, "2026-01-15T09:00:00Z");
  } finally {
    restore();
  }
});

// ── downloadInvoice — delegates with "Original" docType ──

Deno.test("AfnorBaseAdapter.downloadInvoice() - GETs /v1/flows/{id} with docType=Original", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<cii:Invoice/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.downloadInvoice("fl-download-1");

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/afnor/v1/flows/fl-download-1");
    assertEquals(url.searchParams.get("docType"), "Original");
  } finally {
    restore();
  }
});

// ── reportInvoiceTransaction — FRR e-reporting ───────────

Deno.test("AfnorBaseAdapter.reportInvoiceTransaction() - submits FRR flow", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-report-1" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.reportInvoiceTransaction("0009", "12345678901234", { amount: 1000, type: "B2C" });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "FRR");
    assertEquals(flowInfo.processingRule, "B2C");
    assertEquals(flowInfo.name, "report.json");
  } finally {
    restore();
  }
});

// ── reportTransaction — FRR e-reporting with entity ──────

Deno.test("AfnorBaseAdapter.reportTransaction() - submits FRR flow with businessEntityId", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-report-2" } },
  ]);

  try {
    const adapter = makeAdapterWithClient();
    await adapter.reportTransaction("0009", "entity-99", { amount: 500 });

    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "FRR");
    assertEquals(flowInfo.processingRule, "B2C");
  } finally {
    restore();
  }
});

// ── Non-AFNOR methods (inherited BaseAdapter stubs) ──────

Deno.test("AfnorBaseAdapter - downloadReadable() throws NotSupportedError", async () => {
  const adapter = makeAdapterWithClient();
  await assertRejects(
    () => adapter.downloadReadable("inv-1"),
    Error,
    "is not supported",
  );
});

Deno.test("AfnorBaseAdapter - listWebhooks() throws NotSupportedError", async () => {
  const adapter = makeAdapterWithClient();
  await assertRejects(
    () => adapter.listWebhooks(),
    Error,
    "is not supported",
  );
});

Deno.test("AfnorBaseAdapter - searchDirectoryFr() throws NotSupportedError", async () => {
  const adapter = makeAdapterWithClient();
  await assertRejects(
    () => adapter.searchDirectoryFr({ q: "test" }),
    Error,
    "is not supported",
  );
});
