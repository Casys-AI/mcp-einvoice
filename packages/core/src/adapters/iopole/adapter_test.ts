/**
 * IopoleAdapter Tests
 *
 * Tests that IopoleAdapter correctly translates adapter method calls
 * to IopoleClient HTTP requests with the correct Swagger paths.
 *
 * @module lib/einvoice/src/adapters/iopole_test
 */

import { assertEquals } from "jsr:@std/assert";
import { IopoleAdapter } from "./adapter.ts";
import { IopoleClient } from "./client.ts";
import { mockFetch } from "../../testing/helpers.ts";

function makeAdapter() {
  const client = new IopoleClient({
    baseUrl: "https://api.ppd.iopole.fr/v1",
    customerId: "test-customer-id",
    getToken: () => Promise.resolve("test-token"),
  });
  return new IopoleAdapter(client);
}

// ── Identity ─────────────────────────────────────────────

Deno.test("IopoleAdapter - name is 'iopole'", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.name, "iopole");
});

// ── Invoice Operations ───────────────────────────────────

Deno.test("IopoleAdapter.emitInvoice() - POST /invoice (multipart upload)", async () => {
  const { restore, captured } = mockFetch([
    { status: 201, body: { guid: "emit-guid" } },
  ]);

  try {
    const adapter = makeAdapter();
    const file = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await adapter.emitInvoice({
      file,
      filename: "invoice.pdf",
    });

    assertEquals(result, { guid: "emit-guid" });
    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/v1/invoice");
    // Body is FormData, captured as field descriptions
    const body = captured[0].body as Record<string, string>;
    assertEquals(typeof body.file, "string");
    assertEquals(body.file.includes("invoice.pdf"), true);
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.searchInvoices() - GET /v1.1/invoice/search with q param", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [], count: 0 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchInvoices({
      q: "status:accepted AND direction:received",
      offset: 0,
      limit: 10,
    });

    assertEquals(captured[0].method, "GET");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.1/invoice/search");
    assertEquals(
      url.searchParams.get("q"),
      "status:accepted AND direction:received",
    );
    assertEquals(url.searchParams.get("offset"), "0");
    assertEquals(url.searchParams.get("limit"), "10");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.searchInvoices() - uses /v1.1 base (not path traversal)", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchInvoices({ q: "test" });

    const url = new URL(captured[0].url);
    // Must be /v1.1/invoice/search, NOT contain /../ path traversal
    assertEquals(url.pathname, "/v1.1/invoice/search");
    assertEquals(url.pathname.includes(".."), false);
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.searchInvoices() - defaults offset=0, limit=50", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchInvoices({});

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.get("offset"), "0");
    assertEquals(url.searchParams.get("limit"), "50");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.getInvoice() - returns normalized InvoiceDetail", async () => {
  const { restore, captured } = mockFetch([
    // 1st: getInvoice
    {
      status: 200,
      body: {
        invoiceId: "inv-123",
        state: "DELIVERED",
        way: "RECEIVED",
        businessData: {
          invoiceId: "F-001",
          seller: { name: "Acme" },
          buyer: { name: "Corp" },
          monetary: { invoiceCurrency: "EUR", invoiceAmount: { amount: 120 } },
        },
      },
    },
    // 2nd: getStatusHistory (parallel)
    {
      status: 200,
      body: { data: [{ date: "2026-03-19", status: { code: "DELIVERED" } }] },
    },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getInvoice("inv-123");

    assertEquals(result.id, "inv-123");
    assertEquals(result.invoiceNumber, "F-001");
    assertEquals(result.status, "DELIVERED");
    assertEquals(result.direction, "received");
    assertEquals(result.senderName, "Acme");
    assertEquals(result.totalTtc, 120);
    assertEquals(new URL(captured[0].url).pathname, "/v1/invoice/inv-123");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.downloadReadable() - GET /invoice/{id}/download/readable", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "pdf-bytes", contentType: "application/pdf" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.downloadReadable("inv-123");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/inv-123/download/readable",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.getInvoiceFiles() - GET /invoice/{id}/files", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { files: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getInvoiceFiles("inv-123");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/inv-123/files",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.getAttachments() - GET /invoice/{id}/files/attachments", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { attachments: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getAttachments("inv-123");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/inv-123/files/attachments",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.downloadFile() - GET /invoice/file/{fileId}/download", async () => {
  const { restore, captured } = mockFetch([
    {
      status: 200,
      body: "file-bytes",
      contentType: "application/octet-stream",
    },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.downloadFile("file-abc");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/file/file-abc/download",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.markInvoiceSeen() - PUT /invoice/{id}/markAsSeen", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { ok: true } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.markInvoiceSeen("inv-456");

    assertEquals(captured[0].method, "PUT");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/inv-456/markAsSeen",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.getUnseenInvoices() - GET /invoice/notSeen", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getUnseenInvoices({ offset: 10, limit: 5 });

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/invoice/notSeen");
    assertEquals(url.searchParams.get("offset"), "10");
    assertEquals(url.searchParams.get("limit"), "5");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.generateCII() - POST /tools/cii/generate?flavor=EN16931", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<xml>cii</xml>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateCII({
      invoice: { number: "F-001" },
      flavor: "EN16931",
    });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/tools/cii/generate");
    assertEquals(url.searchParams.get("flavor"), "EN16931");
    assertEquals(captured[0].body, { number: "F-001" });
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.generateUBL() - POST /tools/ubl/generate?flavor=MINIMUM", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<xml>ubl</xml>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateUBL({
      invoice: { number: "F-001" },
      flavor: "MINIMUM",
    });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/tools/ubl/generate");
    assertEquals(url.searchParams.get("flavor"), "MINIMUM");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.generateFacturX() - POST /tools/facturx/generate?flavor&language", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<xml>fx</xml>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateFacturX({
      invoice: { number: "F-001" },
      flavor: "EN16931",
      language: "fr",
    });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/tools/facturx/generate");
    assertEquals(url.searchParams.get("flavor"), "EN16931");
    assertEquals(url.searchParams.get("language"), "fr");
  } finally {
    restore();
  }
});

// ── Directory ────────────────────────────────────────────

Deno.test("IopoleAdapter.searchDirectoryFr() - wraps SIRET in Lucene syntax", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [], meta: { count: 0 } } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.searchDirectoryFr({ q: "12345678901234" });

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/directory/french");
    // 14 digits → auto-wrapped to Lucene siret:"..."
    assertEquals(url.searchParams.get("q"), 'siret:"12345678901234"');
    assertEquals(result.rows.length, 0);
    assertEquals(result.count, 0);
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.searchDirectoryInt() - GET /directory/international", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchDirectoryInt({ value: "FR12345678901" });

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/directory/international");
    assertEquals(url.searchParams.get("value"), "FR12345678901");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.checkPeppolParticipant() - GET /directory/international/check/scheme/{s}/value/{v}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { registered: true } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.checkPeppolParticipant("iso6523-actorid-upis", "0208:FR/123");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/directory/international/check/scheme/iso6523-actorid-upis/value/0208%3AFR%2F123",
    );
  } finally {
    restore();
  }
});

// ── Status ───────────────────────────────────────────────

Deno.test("IopoleAdapter.sendStatus() - POST /invoice/{invoiceId}/status with code + message", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "status-guid" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.sendStatus({
      invoiceId: "inv-123",
      code: "APPROVED",
      message: "Looks good",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/inv-123/status",
    );
    assertEquals(captured[0].body, {
      code: "APPROVED",
      message: "Looks good",
    });
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.getStatusHistory() - GET /invoice/{invoiceId}/status-history", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { history: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getStatusHistory("inv-123");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/inv-123/status-history",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.getUnseenStatuses() - GET /invoice/status/notSeen", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getUnseenStatuses({ offset: 0, limit: 20 });

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1/invoice/status/notSeen");
    assertEquals(url.searchParams.get("offset"), "0");
    assertEquals(url.searchParams.get("limit"), "20");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.markStatusSeen() - PUT /invoice/status/{statusId}/markAsSeen", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { ok: true } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.markStatusSeen("status-456");

    assertEquals(captured[0].method, "PUT");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/invoice/status/status-456/markAsSeen",
    );
  } finally {
    restore();
  }
});

// ── Reporting ────────────────────────────────────────────

Deno.test("IopoleAdapter.reportInvoiceTransaction() - POST /reporting/fr/invoice/transaction", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "report-guid" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.reportInvoiceTransaction({
      amount: 1000,
      date: "2026-01-01",
    });

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/reporting/fr/invoice/transaction",
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.reportTransaction() - POST /reporting/fr/transaction/{businessEntityId}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "report-guid" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.reportTransaction("be-123", {
      amount: 500,
      date: "2026-03-01",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/reporting/fr/transaction/be-123",
    );
    assertEquals(captured[0].body, { amount: 500, date: "2026-03-01" });
  } finally {
    restore();
  }
});

// ── Webhooks ─────────────────────────────────────────────

Deno.test("IopoleAdapter.listWebhooks() - GET /config/webhook", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: [{ id: "wh-1", url: "https://example.com/hook" }] },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.listWebhooks();

    assertEquals(result, [{ id: "wh-1", url: "https://example.com/hook" }]);
    assertEquals(new URL(captured[0].url).pathname, "/v1/config/webhook");
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.createWebhook() - POST /config/webhook", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "wh-new" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.createWebhook({
      url: "https://example.com/hook",
      events: ["invoice.received", "status.changed"],
      name: "My Webhook",
    });

    assertEquals(captured[0].body, {
      url: "https://example.com/hook",
      events: ["invoice.received", "status.changed"],
      name: "My Webhook",
    });
  } finally {
    restore();
  }
});

Deno.test("IopoleAdapter.deleteWebhook() - DELETE /config/webhook/{id}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { ok: true } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.deleteWebhook("wh-123");

    assertEquals(captured[0].method, "DELETE");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1/config/webhook/wh-123",
    );
  } finally {
    restore();
  }
});
