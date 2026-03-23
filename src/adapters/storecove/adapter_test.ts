/**
 * StorecoveAdapter Tests
 *
 * Tests that StorecoveAdapter correctly translates adapter method calls
 * to StorecoveClient HTTP requests with the correct paths, and that
 * unsupported methods throw NotSupportedError.
 *
 * @module lib/einvoice/src/adapters/storecove/adapter_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { StorecoveAdapter } from "./adapter.ts";
import { StorecoveClient } from "./client.ts";
import { mockFetch } from "../../testing/helpers.ts";

function makeAdapter(defaultLegalEntityId?: string) {
  const client = new StorecoveClient({
    baseUrl: "https://api.storecove.com/api/v2",
    apiKey: "test-api-key",
  });
  return new StorecoveAdapter(client, defaultLegalEntityId);
}

// ── Identity ─────────────────────────────────────────────

Deno.test("StorecoveAdapter - name is 'storecove'", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.name, "storecove");
});

Deno.test("StorecoveAdapter - capabilities contains expected methods", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.capabilities.has("emitInvoice"), true);
  assertEquals(adapter.capabilities.has("getInvoice"), true);
  assertEquals(adapter.capabilities.has("downloadInvoice"), true);
  assertEquals(adapter.capabilities.has("searchDirectoryFr"), true);
  assertEquals(adapter.capabilities.has("searchDirectoryInt"), true);
  assertEquals(adapter.capabilities.has("checkPeppolParticipant"), true);
  assertEquals(adapter.capabilities.has("getStatusHistory"), true);
  assertEquals(adapter.capabilities.has("getBusinessEntity"), true);
  assertEquals(adapter.capabilities.has("deleteBusinessEntity"), true);
  assertEquals(adapter.capabilities.has("enrollInternational"), true);
  assertEquals(adapter.capabilities.has("registerNetwork"), true);
  assertEquals(adapter.capabilities.has("registerNetworkByScheme"), true);
  assertEquals(adapter.capabilities.has("unregisterNetwork"), true);
  assertEquals(adapter.capabilities.has("createIdentifier"), true);
  assertEquals(adapter.capabilities.has("deleteIdentifier"), true);
});

Deno.test("StorecoveAdapter - capabilities excludes unsupported methods", () => {
  const adapter = makeAdapter();
  assertEquals(adapter.capabilities.has("searchInvoices"), false);
  assertEquals(adapter.capabilities.has("downloadReadable"), false);
  assertEquals(adapter.capabilities.has("sendStatus"), false);
  assertEquals(adapter.capabilities.has("listBusinessEntities"), false);
  assertEquals(adapter.capabilities.has("generateCII"), false);
  assertEquals(adapter.capabilities.has("generateUBL"), false);
  assertEquals(adapter.capabilities.has("generateFacturX"), false);
  assertEquals(adapter.capabilities.has("enrollFrench"), false);
});

// ── Invoice Operations ───────────────────────────────────

Deno.test("StorecoveAdapter.emitInvoice() - POST /document_submissions with XML", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "doc-123" } },
  ]);

  try {
    const adapter = makeAdapter();
    const file = new Uint8Array([0x3C, 0x3F, 0x78, 0x6D, 0x6C]); // <?xml
    const result = await adapter.emitInvoice({ file, filename: "invoice.xml" });

    assertEquals(result, { guid: "doc-123" });
    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/document_submissions",
    );
    const body = captured[0].body as Record<string, unknown>;
    const doc = body.document as Record<string, unknown>;
    assertEquals(doc.document_type, "invoice");
    assertEquals(doc.raw_document_content_type, "application/xml");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.emitInvoice() - PDF uses application/pdf content type", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "doc-pdf" } },
  ]);

  try {
    const adapter = makeAdapter();
    const file = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    await adapter.emitInvoice({ file, filename: "invoice.pdf" });

    const body = captured[0].body as Record<string, unknown>;
    const doc = body.document as Record<string, unknown>;
    assertEquals(doc.raw_document_content_type, "application/pdf");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.emitInvoice() - includes legal_entity_id when defaultLegalEntityId set", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "doc-with-entity" } },
  ]);

  try {
    const adapter = makeAdapter("42");
    const file = new Uint8Array([0x3C, 0x3F, 0x78, 0x6D, 0x6C]);
    await adapter.emitInvoice({ file, filename: "invoice.xml" });

    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.legal_entity_id, 42);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.emitInvoice() - omits legal_entity_id when not set", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "doc-no-entity" } },
  ]);

  try {
    const adapter = makeAdapter(); // no defaultLegalEntityId
    const file = new Uint8Array([0x3C, 0x3F, 0x78, 0x6D, 0x6C]);
    await adapter.emitInvoice({ file, filename: "invoice.xml" });

    const body = captured[0].body as Record<string, unknown>;
    assertEquals("legal_entity_id" in body, false);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.getInvoice() - GET /received_documents/{id}/json", async () => {
  const { restore, captured } = mockFetch([
    {
      status: 200,
      body: {
        invoiceNumber: "F-001",
        status: "received",
        issueDate: "2026-03-01",
        dueDate: "2026-04-01",
        documentCurrencyCode: "EUR",
        legalMonetaryTotal: { payableAmount: 1200 },
        accountingSupplierParty: { party: { partyName: "Acme Corp" } },
        accountingCustomerParty: { party: { partyName: "Test Corp" } },
      },
    },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getInvoice("inv-123");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/received_documents/inv-123/json",
    );
    assertEquals(result.id, "inv-123");
    assertEquals(result.invoiceNumber, "F-001");
    assertEquals(result.status, "received");
    assertEquals(result.direction, "received");
    assertEquals(result.senderName, "Acme Corp");
    assertEquals(result.receiverName, "Test Corp");
    assertEquals(result.issueDate, "2026-03-01");
    assertEquals(result.dueDate, "2026-04-01");
    assertEquals(result.currency, "EUR");
    assertEquals(result.totalTtc, 1200);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.getInvoice() - encodes special chars in ID (path segment safety)", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { invoiceNumber: "X", status: "received" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getInvoice("id/with/slashes");

    const pathname = new URL(captured[0].url).pathname;
    // Slashes in the ID must be encoded, not treated as path separators
    assertEquals(pathname.includes("id/with/slashes"), false);
    assertEquals(pathname.includes("%2F"), true);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.getInvoice() - direction is always 'received'", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { invoiceNumber: "X", status: "processed" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getInvoice("any-id");
    assertEquals(result.direction, "received");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.downloadInvoice() - GET /received_documents/{id}/original", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<xml/>", contentType: "application/xml" },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.downloadInvoice("inv-456");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/received_documents/inv-456/original",
    );
    assertEquals(result.contentType, "application/xml");
  } finally {
    restore();
  }
});

// ── NotSupportedError stubs (Invoice) ────────────────────

Deno.test("StorecoveAdapter.searchInvoices() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.searchInvoices({}),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.downloadReadable() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.downloadReadable("inv-1"),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.getInvoiceFiles() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.getInvoiceFiles("inv-1"),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.getAttachments() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.getAttachments("inv-1"),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.downloadFile() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.downloadFile("file-1"),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.markInvoiceSeen() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.markInvoiceSeen("inv-1"),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.generateCII() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.generateCII({ invoice: {}, flavor: "EN16931" }),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.generateUBL() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.generateUBL({ invoice: {}, flavor: "EN16931" }),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.generateFacturX() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.generateFacturX({ invoice: {}, flavor: "EN16931" }),
    Error,
    "is not supported",
  );
});

// ── Directory ────────────────────────────────────────────

Deno.test("StorecoveAdapter.searchDirectoryFr() - POST /discovery/exists with q as identifier", async () => {
  const { restore, captured } = mockFetch([
    {
      status: 200,
      body: {
        participant: {
          identifier: "0009:123456789",
          name: "Acme SA",
          country: "FR",
        },
      },
    },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.searchDirectoryFr({ q: "0009:123456789" });

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/api/v2/discovery/exists");
    assertEquals(
      (captured[0].body as Record<string, unknown>).identifier,
      "0009:123456789",
    );
    assertEquals(result.count, 1);
    assertEquals(result.rows.length, 1);
    assertEquals(result.rows[0].entityId, "0009:123456789");
    assertEquals(result.rows[0].name, "Acme SA");
    assertEquals(result.rows[0].country, "FR");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.searchDirectoryFr() - returns empty result when no participant", async () => {
  const { restore } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.searchDirectoryFr({ q: "unknown-id" });

    assertEquals(result.rows, []);
    assertEquals(result.count, 0);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.searchDirectoryFr() - handles flat response (no participant wrapper)", async () => {
  const { restore } = mockFetch([
    {
      status: 200,
      body: { identifier: "0225:FR123", name: "Test Co", country: "FR" },
    },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.searchDirectoryFr({ q: "0225:FR123" });

    assertEquals(result.count, 1);
    assertEquals(result.rows[0].entityId, "0225:FR123");
    assertEquals(result.rows[0].name, "Test Co");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.searchDirectoryInt() - POST /discovery/receives", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { receives: true } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.searchDirectoryInt({ value: "0208:BE0123456789" });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/discovery/receives",
    );
    assertEquals(
      (captured[0].body as Record<string, unknown>).identifier,
      "0208:BE0123456789",
    );
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.checkPeppolParticipant() - POST /discovery/exists with scheme + identifier", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { exists: true } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.checkPeppolParticipant("iso6523-actorid-upis", "0208:FR/123");

    assertEquals(captured[0].method, "POST");
    assertEquals(new URL(captured[0].url).pathname, "/api/v2/discovery/exists");
    const body = captured[0].body as Record<string, unknown>;
    const identifier = body.identifier as Record<string, unknown>;
    assertEquals(identifier.scheme, "iso6523-actorid-upis");
    assertEquals(identifier.identifier, "0208:FR/123");
  } finally {
    restore();
  }
});

// ── Status ───────────────────────────────────────────────

Deno.test("StorecoveAdapter.getStatusHistory() - GET /document_submissions/{id}/evidence/delivery", async () => {
  const { restore, captured } = mockFetch([
    {
      status: 200,
      body: {
        timestamp: "2026-03-20T10:00:00Z",
        status: "delivered",
        description: "Delivered OK",
      },
    },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getStatusHistory("doc-999");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/document_submissions/doc-999/evidence/delivery",
    );
    assertEquals(result.entries.length, 1);
    assertEquals(result.entries[0].date, "2026-03-20T10:00:00Z");
    assertEquals(result.entries[0].code, "delivered");
    assertEquals(result.entries[0].message, "Delivered OK");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.getStatusHistory() - encodes special chars in ID", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { status: "delivered" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getStatusHistory("sub/id:special");

    const pathname = new URL(captured[0].url).pathname;
    assertEquals(pathname.includes("sub/id:special"), false);
    assertEquals(pathname.includes("%2F"), true);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.getStatusHistory() - returns empty entries when no response body", async () => {
  const { restore } = mockFetch([
    { status: 200, body: null },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getStatusHistory("doc-empty");
    assertEquals(result.entries, []);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.sendStatus() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.sendStatus({ invoiceId: "inv-1", code: "fr:205" }),
    Error,
    "is not supported",
  );
});

// ── Webhooks (all throw NotSupportedError) ───────────────

Deno.test("StorecoveAdapter.listWebhooks() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.listWebhooks(),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.deleteWebhook() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.deleteWebhook("wh-1"),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.createWebhook() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.createWebhook({ url: "http://example.com/hook", events: [] }),
    Error,
    "is not supported",
  );
});

// ── Operator Config ──────────────────────────────────────

Deno.test("StorecoveAdapter.getBusinessEntity() - GET /legal_entities/{id}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 42, name: "Acme SA" } },
  ]);

  try {
    const adapter = makeAdapter();
    const result = await adapter.getBusinessEntity("42");

    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/legal_entities/42",
    );
    assertEquals((result as Record<string, unknown>).id, 42);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.getBusinessEntity() - encodes special chars in ID", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "x" } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.getBusinessEntity("id with spaces");

    const pathname = new URL(captured[0].url).pathname;
    assertEquals(pathname.includes("id with spaces"), false);
    assertEquals(pathname.includes("%20"), true);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.deleteBusinessEntity() - DELETE /legal_entities/{id}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.deleteBusinessEntity("99");

    assertEquals(captured[0].method, "DELETE");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/legal_entities/99",
    );
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.createLegalUnit() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.createLegalUnit({ name: "Acme" }),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.configureBusinessEntity() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.configureBusinessEntity("42", { name: "Updated" }),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.listBusinessEntities() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.listBusinessEntities(),
    Error,
    "is not supported",
  );
});

// ── Enrollment / Network ─────────────────────────────────

Deno.test("StorecoveAdapter.enrollInternational() - POST /legal_entities/{id}/peppol_identifiers", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 1 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.enrollInternational({
      legalEntityId: "42",
      scheme: "0225",
      identifier: "FR123456789",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/legal_entities/42/peppol_identifiers",
    );
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.scheme, "0225");
    assertEquals(body.identifier, "FR123456789");
    assertEquals(body.superscheme, "iso6523-actorid-upis");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.enrollInternational() - uses defaultLegalEntityId when not in data", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 2 } },
  ]);

  try {
    const adapter = makeAdapter("55");
    await adapter.enrollInternational({ scheme: "0225", identifier: "FR999" });

    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/legal_entities/55/peppol_identifiers",
    );
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.enrollInternational() - throws when no legalEntityId available", async () => {
  const adapter = makeAdapter(); // no default
  await assertRejects(
    () => adapter.enrollInternational({ scheme: "0225", identifier: "FR999" }),
    Error,
    "enrollInternational requires legalEntityId",
  );
});

Deno.test("StorecoveAdapter.enrollFrench() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.enrollFrench({ identifier: "12345678901234" }),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.registerNetwork() - returns informational message (no HTTP call)", async () => {
  const adapter = makeAdapter();
  const result = await adapter.registerNetwork(
    "0009:43446637100011",
    "PEPPOL_INTERNATIONAL",
  );

  assertEquals(typeof (result as Record<string, unknown>).message, "string");
  assertEquals(
    (result as Record<string, unknown>).message as string,
    "Peppol identifier 0009:43446637100011 is registered on creation in Storecove.",
  );
});

Deno.test("StorecoveAdapter.registerNetworkByScheme() - returns informational message (no HTTP call)", async () => {
  const adapter = makeAdapter();
  const result = await adapter.registerNetworkByScheme(
    "0225",
    "FR123",
    "PEPPOL_INTERNATIONAL",
  );

  const msg = (result as Record<string, unknown>).message as string;
  assertEquals(typeof msg, "string");
  assertEquals(msg.includes("0225:FR123"), true);
});

Deno.test("StorecoveAdapter.unregisterNetwork() - DELETE Peppol identifier path", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.unregisterNetwork("42/iso6523-actorid-upis/0225/FR123");

    assertEquals(captured[0].method, "DELETE");
    const pathname = new URL(captured[0].url).pathname;
    assertEquals(pathname.startsWith("/api/v2/legal_entities/42/"), true);
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.unregisterNetwork() - throws when directoryId has fewer than 4 segments", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.unregisterNetwork("42/iso6523/0225"),
    Error,
    "unregisterNetwork expects directoryId",
  );
});

// ── Identifier Management ────────────────────────────────

Deno.test("StorecoveAdapter.createIdentifier() - Peppol (scheme starts with 0) → /peppol_identifiers", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 10 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.createIdentifier("42", {
      scheme: "0225",
      value: "FR123",
      superscheme: "iso6523-actorid-upis",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/legal_entities/42/peppol_identifiers",
    );
    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body.scheme, "0225");
    assertEquals(body.identifier, "FR123");
    assertEquals(body.superscheme, "iso6523-actorid-upis");
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.createIdentifier() - non-Peppol scheme → /additional_tax_identifiers", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: 20 } },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.createIdentifier("42", {
      scheme: "VAT",
      value: "FR123456789",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/api/v2/legal_entities/42/additional_tax_identifiers",
    );
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.createIdentifierByScheme() - throws NotSupportedError", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.createIdentifierByScheme("0225", "FR123", {}),
    Error,
    "is not supported",
  );
});

Deno.test("StorecoveAdapter.deleteIdentifier() - path with slashes → DELETE /legal_entities/...", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const adapter = makeAdapter();
    await adapter.deleteIdentifier(
      "42/peppol_identifiers/iso6523-actorid-upis/0225/FR123",
    );

    assertEquals(captured[0].method, "DELETE");
    assertEquals(
      new URL(captured[0].url).pathname.startsWith("/api/v2/legal_entities/"),
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("StorecoveAdapter.deleteIdentifier() - plain ID (no slash) throws", async () => {
  const adapter = makeAdapter();
  await assertRejects(
    () => adapter.deleteIdentifier("12345"),
    Error,
    "deleteIdentifier for tax identifiers requires the full path",
  );
});
