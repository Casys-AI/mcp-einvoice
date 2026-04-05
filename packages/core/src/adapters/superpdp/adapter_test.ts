/**
 * SuperPDPAdapter Tests
 *
 * Tests that SuperPDPAdapter correctly translates adapter method calls
 * to Super PDP native API endpoints, and that AFNOR-inherited methods
 * call the AFNOR flow endpoints.
 *
 * Fixtures conform to superpdp.json v1.13.0.beta OpenAPI spec.
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

// ── Fixtures (conformes superpdp.json v1.13.0.beta) ──────

const INVOICE_FIXTURE = {
  id: 12345,
  company_id: 2913,
  created_at: "2026-03-20T10:00:00Z",
  direction: "out",
  external_id: "F-001",
  en_invoice: {
    number: "F-001",
    issue_date: "2026-03-20",
    due_date: "2026-04-20",
    currency_code: "EUR",
    type_code: "380",
    seller: { name: "Burger Queen", country: "FR" },
    buyer: { name: "Test Corp", country: "FR" },
    totals: {
      line_extension_amount: 1000,
      tax_exclusive_amount: 1000,
      tax_inclusive_amount: 1200,
      amount_due_for_payment: 1200,
    },
  },
  events: [
    {
      id: 1,
      invoice_id: 12345,
      status_code: "fr:200",
      status_text: "Déposée",
      created_at: "2026-03-20T10:00:00Z",
    },
    {
      id: 2,
      invoice_id: 12345,
      status_code: "fr:205",
      status_text: "Approuvée",
      created_at: "2026-03-20T11:00:00Z",
    },
  ],
};

const LIST_INVOICES_FIXTURE = {
  data: [INVOICE_FIXTURE],
  count: 1,
  has_after: false,
  has_before: false,
};

const LIST_EVENTS_FIXTURE = {
  data: [
    {
      id: 1,
      invoice_id: 12345,
      status_code: "fr:200",
      status_text: "Déposée",
      created_at: "2026-03-20T10:00:00Z",
      data: {},
    },
    {
      id: 2,
      invoice_id: 12345,
      status_code: "fr:205",
      status_text: "Approuvée",
      created_at: "2026-03-20T11:00:00Z",
      data: { reason: "OK" },
    },
  ],
  has_after: false,
};

const DIRECTORY_ENTRY_FIXTURE = {
  id: 9396,
  company: { id: 2913, formal_name: "Burger Queen", country: "FR" },
  directory: "peppol",
  identifier: "0225:315143296_2913",
  status: "created",
  created_at: "2026-03-20T01:06:39Z",
  is_replyto: false,
};

// ── Identity ─────────────────────────────────────────────

Deno.test("SuperPDPAdapter - name is 'superpdp'", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.name, "superpdp");
});

Deno.test("SuperPDPAdapter - capabilities contains 21 methods", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.capabilities.size, 21);
  assertEquals(adapter.capabilities.has("emitInvoice"), true);
  assertEquals(adapter.capabilities.has("searchInvoices"), true);
  assertEquals(adapter.capabilities.has("generateCII"), true);
  assertEquals(adapter.capabilities.has("reportInvoiceTransaction"), true);
  assertEquals(adapter.capabilities.has("reportTransaction"), true);
  assertEquals(adapter.capabilities.has("downloadReadable"), false);
  assertEquals(adapter.capabilities.has("listWebhooks"), false);
});

// ── Invoice Operations (native) ─────────────────────────

Deno.test("SuperPDPAdapter.emitInvoice() - POST /invoices with XML", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 12345 } },
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

Deno.test("SuperPDPAdapter.searchInvoices() - maps en_invoice nested fields", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: LIST_INVOICES_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.searchInvoices({ limit: 10 });

    // Verify expand[] params in URL
    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.getAll("expand[]").sort(), [
      "en_invoice",
      "events",
    ]);
    assertEquals(url.searchParams.get("limit"), "10");

    // Verify mapping from en_invoice nested structure
    assertEquals(result.count, 1);
    assertEquals(result.rows.length, 1);
    const row = result.rows[0];
    assertEquals(row.id, "12345");
    assertEquals(row.invoiceNumber, "F-001");
    assertEquals(row.status, "fr:205"); // last event
    assertEquals(row.direction, "sent"); // "out" → "sent"
    assertEquals(row.senderName, "Burger Queen");
    assertEquals(row.receiverName, "Test Corp");
    assertEquals(row.date, "2026-03-20");
    assertEquals(row.amount, 1200);
    assertEquals(row.currency, "EUR");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.searchInvoices() - direction 'in' passed as query param", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [], count: 0 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchInvoices({ q: "in" });

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.get("direction"), "in");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.searchInvoices() - ignores free-text q (not 'in'/'out')", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [], count: 0 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchInvoices({ q: "some search text" });

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.has("direction"), false);
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.getInvoice() - maps en_invoice + events", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: INVOICE_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getInvoice("12345");

    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/invoices/12345");
    assertEquals(result.id, "12345");
    assertEquals(result.invoiceNumber, "F-001");
    assertEquals(result.status, "fr:205"); // last event status_code
    assertEquals(result.direction, "sent"); // "out" → "sent"
    assertEquals(result.senderName, "Burger Queen");
    assertEquals(result.receiverName, "Test Corp");
    assertEquals(result.issueDate, "2026-03-20");
    assertEquals(result.dueDate, "2026-04-20");
    assertEquals(result.currency, "EUR");
    assertEquals(result.totalHt, 1000);
    assertEquals(result.totalTtc, 1200);
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.getInvoice() - direction 'in' maps to 'received'", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { ...INVOICE_FIXTURE, direction: "in" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getInvoice("12345");
    assertEquals(result.direction, "received");
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
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/invoices/inv-1/download",
    );
  } finally {
    restore();
  }
});

// ── Format Conversion (native) ──────────────────────────

Deno.test("SuperPDPAdapter.generateCII() - POST /invoices/convert?from=en16931&to=cii", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<cii:invoice/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateCII({
      invoice: { invoiceId: "F-001" },
      flavor: "EN16931",
    });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoices/convert");
    assertEquals(url.searchParams.get("from"), "en16931");
    assertEquals(url.searchParams.get("to"), "cii");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.generateUBL() - POST /invoices/convert?from=en16931&to=ubl", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<ubl:Invoice/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.generateUBL({
      invoice: { invoiceId: "F-001" },
      flavor: "EN16931",
    });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoices/convert");
    assertEquals(url.searchParams.get("from"), "en16931");
    assertEquals(url.searchParams.get("to"), "ubl");
  } finally {
    restore();
  }
});

// ── Status / Events (native) ────────────────────────────

Deno.test("SuperPDPAdapter.sendStatus() - spec-compliant body with message", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 99 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.sendStatus({
      invoiceId: "12345",
      code: "fr:205",
      message: "Facture validée",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/invoice_events");
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.invoice_id, 12345); // integer, not string
    assertEquals(body.status_code, "fr:205");
    // deno-lint-ignore no-explicit-any
    assertEquals((body.details as any)[0].reason, "Facture validée");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.sendStatus() - spec-compliant body with payment amounts", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 100 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.sendStatus({
      invoiceId: "12345",
      code: "fr:212",
      payment: {
        amounts: [{
          vat_rate: "20.0",
          net_amount: "1000.00",
          currency_code: "EUR",
          type_code: "MEN",
        }],
      },
    });

    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.invoice_id, 12345);
    assertEquals(body.status_code, "fr:212");
    // deno-lint-ignore no-explicit-any
    const details = body.details as any[];
    assertEquals(details[0].amounts[0].vat_rate, "20.0");
    assertEquals(details[0].amounts[0].net_amount, "1000.00");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.sendStatus() - no details when no message/payment", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 101 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.sendStatus({ invoiceId: "12345", code: "fr:204" });

    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.invoice_id, 12345);
    assertEquals(body.status_code, "fr:204");
    assertEquals(body.details, undefined);
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.getStatusHistory() - maps list_events response", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: LIST_EVENTS_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getStatusHistory("12345");

    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.beta/invoice_events");
    assertEquals(url.searchParams.get("invoice_id"), "12345");
    assertEquals(result.entries.length, 2);
    assertEquals(result.entries[0].code, "fr:200");
    assertEquals(result.entries[0].date, "2026-03-20T10:00:00Z");
    assertEquals(result.entries[1].code, "fr:205");
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
    await adapter.reportInvoiceTransaction("0009", "12345678901234", { amount: 1000, type: "B2C" });

    assertEquals(captured[0].method, "POST");
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
    await adapter.reportTransaction("0009", "entity-1", { amount: 500 });

    assertEquals(captured[0].url.includes("afnor-flow"), true);
  } finally {
    restore();
  }
});

// ── Directory (native) ──────────────────────────────────

Deno.test("SuperPDPAdapter.searchDirectoryFr() - maps directory_entry response", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [DIRECTORY_ENTRY_FIXTURE] } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.searchDirectoryFr({ q: "test" });

    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries",
    );
    assertEquals(result.rows.length, 1);
    assertEquals(result.rows[0].entityId, "9396");
    assertEquals(result.rows[0].name, "Burger Queen");
    assertEquals(result.rows[0].siret, "0225:315143296_2913");
    assertEquals(result.rows[0].country, "FR");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.registerNetwork() - maps to { directory, identifier }", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: DIRECTORY_ENTRY_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.registerNetwork("0009:43446637100011", "DOMESTIC_FR");

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries",
    );
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.directory, "ppf");
    assertEquals(body.identifier, "0009:43446637100011");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.registerNetworkByScheme() - maps to { directory, identifier: 'scheme:value' }", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: DIRECTORY_ENTRY_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.registerNetworkByScheme(
      "0225",
      "315143296_2913",
      "PEPPOL_INTERNATIONAL",
    );

    assertEquals(captured[0].method, "POST");
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.directory, "peppol");
    assertEquals(body.identifier, "0225:315143296_2913");
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
    await adapter.unregisterNetwork("9396");

    assertEquals(captured[0].method, "DELETE");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries/9396",
    );
  } finally {
    restore();
  }
});

// ── Config (native) ─────────────────────────────────────

Deno.test("SuperPDPAdapter.getCustomerId() - GET /companies/me", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 2913, formal_name: "Burger Queen" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getCustomerId();

    assertEquals(result, "2913");
    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/companies/me");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.getBusinessEntity() - GET /companies/me (ignores id)", async () => {
  const { restore, captured } = mockFetch([
    {
      status: 200,
      body: { id: 2913, formal_name: "Burger Queen", country: "FR" },
    },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getBusinessEntity("ignored-id");

    assertEquals(new URL(captured[0].url).pathname, "/v1.beta/companies/me");
    // deno-lint-ignore no-explicit-any
    assertEquals((result as any).id, 2913);
  } finally {
    restore();
  }
});

// ── Office / Enrollment (native via directory) ──────────

Deno.test("SuperPDPAdapter.createOffice() - POST /directory_entries", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: DIRECTORY_ENTRY_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.createOffice({
      directory: "ppf",
      identifier: "0009:43446637100011",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries",
    );
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.directory, "ppf");
    assertEquals(body.identifier, "0009:43446637100011");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.enrollFrench() - POST /directory_entries", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: DIRECTORY_ENTRY_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.enrollFrench({
      directory: "ppf",
      identifier: "0009:43446637100011",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries",
    );
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.directory, "ppf");
  } finally {
    restore();
  }
});

// ── Identifier Management (native via directory) ────────

Deno.test("SuperPDPAdapter.createIdentifier() - POST /directory_entries with structured body", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: DIRECTORY_ENTRY_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.createIdentifier("entity-1", {
      directory: "peppol",
      identifier: "0225:315143296_2913",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries",
    );
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.directory, "peppol");
    assertEquals(body.identifier, "0225:315143296_2913");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.createIdentifierByScheme() - POST with constructed identifier", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: DIRECTORY_ENTRY_FIXTURE },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.createIdentifierByScheme("0225", "315143296_2913", {
      directory: "peppol",
    });

    assertEquals(captured[0].method, "POST");
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.directory, "peppol");
    assertEquals(body.identifier, "0225:315143296_2913");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPAdapter.deleteIdentifier() - DELETE /directory_entries/{id}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.deleteIdentifier("9396");

    assertEquals(captured[0].method, "DELETE");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries/9396",
    );
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
    "is not supported",
  );
});

Deno.test("SuperPDPAdapter.listWebhooks() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.listWebhooks(),
    Error,
    "is not supported",
  );
});

Deno.test("SuperPDPAdapter.createWebhook() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.createWebhook({ url: "http://test", events: [] }),
    Error,
    "is not supported",
  );
});

Deno.test("SuperPDPAdapter.listBusinessEntities() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.listBusinessEntities(),
    Error,
    "is not supported",
  );
});
