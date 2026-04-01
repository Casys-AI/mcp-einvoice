/**
 * Invoice Tools Tests
 *
 * Tests that invoice tools correctly call adapter methods
 * and handle validation.
 *
 * @module lib/einvoice/src/tools/invoice_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { invoiceTools } from "./invoice.ts";
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";
import {
  _clearStore,
  _expireEntry,
  getGenerated,
  storeGenerated,
} from "../generated-store.ts";

function findTool(name: string) {
  const tool = invoiceTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── Emit ─────────────────────────────────────────────────

Deno.test("einvoice_invoice_submit - calls adapter.emitInvoice with file", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_submit");

  // btoa("hello") = "aGVsbG8="
  await tool.handler({ file_base64: "aGVsbG8=", filename: "invoice.pdf" }, {
    adapter,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "emitInvoice");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.filename, "invoice.pdf");
  assertEquals(arg.file instanceof Uint8Array, true);
});

Deno.test("einvoice_invoice_submit - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_submit");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "Provide either 'generated_id' or both 'file_base64' and 'filename'",
  );
});

Deno.test("einvoice_invoice_submit - throws for invalid filename extension", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_submit");

  await assertRejects(
    () =>
      tool.handler({ file_base64: "aGVsbG8=", filename: "invoice.docx" }, {
        adapter,
      }),
    Error,
    "filename must end in .pdf or .xml",
  );
});

// ── Search ───────────────────────────────────────────────

Deno.test("einvoice_invoice_search - calls adapter.searchInvoices with q and pagination", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_search");

  await tool.handler({ q: "status:accepted", offset: 0, limit: 10 }, {
    adapter,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "searchInvoices");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, "status:accepted");
  assertEquals(arg.offset, 0);
  assertEquals(arg.limit, 10);
});

Deno.test("einvoice_invoice_search - sanitizes empty string to undefined", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_search");

  await tool.handler({ q: "" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, undefined);
});

Deno.test("einvoice_invoice_search - sanitizes whitespace-only to undefined", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_search");

  await tool.handler({ q: "  " }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, undefined);
});

Deno.test("einvoice_invoice_search - sanitizes wildcard '*' to undefined", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_search");

  await tool.handler({ q: "*" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, undefined);
});

Deno.test("einvoice_invoice_search - sanitizes ' * ' to undefined", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_search");

  await tool.handler({ q: " * " }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, undefined);
});

// ── Get ──────────────────────────────────────────────────

Deno.test("einvoice_invoice_get - calls adapter.getInvoice", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_get");

  await tool.handler({ id: "inv-123" }, { adapter });

  assertEquals(calls[0].method, "getInvoice");
  assertEquals(calls[0].args[0], "inv-123");
});

Deno.test("einvoice_invoice_get - throws without id", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_get");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'id' is required",
  );
});

// ── Download ─────────────────────────────────────────────

Deno.test("einvoice_invoice_download - returns base64-encoded result", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_download");

  const result = unwrapStructured(
    await tool.handler({ id: "inv-123" }, { adapter }),
  ) as Record<string, unknown>;

  assertEquals(result.content_type, "application/xml");
  assertEquals(typeof result.data_base64, "string");
  assertEquals(result.size_bytes, 3);
});

// ── Download Readable ────────────────────────────────────

Deno.test("einvoice_invoice_download_readable - returns base64 PDF", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_download_readable");

  const result = unwrapStructured(
    await tool.handler({ id: "inv-123" }, { adapter }),
  ) as Record<string, unknown>;

  assertEquals(result.content_type, "application/pdf");
  assertEquals(result.size_bytes, 3);
});

// ── Invoice Files ────────────────────────────────────────

Deno.test("einvoice_invoice_files - calls adapter.getInvoiceFiles", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_files");

  await tool.handler({ id: "inv-123" }, { adapter });

  assertEquals(calls[0].method, "getInvoiceFiles");
  assertEquals(calls[0].args[0], "inv-123");
});

// ── Download File ────────────────────────────────────────

Deno.test("einvoice_invoice_download_file - returns base64-encoded result", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_download_file");

  const result = unwrapStructured(
    await tool.handler({ file_id: "file-abc" }, { adapter }),
  ) as Record<string, unknown>;

  assertEquals(result.content_type, "application/octet-stream");
  assertEquals(typeof result.data_base64, "string");
  assertEquals(result.size_bytes, 3);
});

Deno.test("einvoice_invoice_download_file - throws without file_id", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_download_file");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'file_id' is required",
  );
});

// mark_seen / seen / notSeen tools removed in v0.2.0 — see docs/CHANGELOG.md

// ── Generate Formats (preview flow) ──────────────────────

Deno.test("einvoice_invoice_generate_cii - returns generated_id, no auto-emit", async () => {
  _clearStore();
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_generate_cii");

  const result = unwrapStructured(
    await tool.handler(
      { invoice: { invoiceId: "F-001" }, flavor: "EN16931" },
      { adapter },
    ),
  ) as Record<string, unknown>;

  // Should call generateCII but NOT emitInvoice
  assertEquals(calls[0].method, "generateCII");
  assertEquals(calls.length, 1); // no emitInvoice call
  assertEquals(typeof result.generated_id, "string");
  assertEquals(result.filename, "F-001.xml");
  assertEquals(typeof result.preview, "object");
});

Deno.test("einvoice_invoice_generate_cii - throws without flavor", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_generate_cii");

  await assertRejects(
    () => tool.handler({ invoice: { number: "F-001" } }, { adapter }),
    Error,
    "'invoice' and 'flavor' are required",
  );
});

Deno.test("einvoice_invoice_generate_ubl - returns generated_id, no auto-emit", async () => {
  _clearStore();
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_generate_ubl");

  const result = unwrapStructured(
    await tool.handler(
      { invoice: { invoiceId: "U-001" }, flavor: "MINIMUM" },
      { adapter },
    ),
  ) as Record<string, unknown>;

  assertEquals(calls[0].method, "generateUBL");
  assertEquals(calls.length, 1);
  assertEquals(typeof result.generated_id, "string");
  assertEquals(result.filename, "U-001.xml");
});

Deno.test("einvoice_invoice_generate_facturx - returns generated_id, no auto-emit", async () => {
  _clearStore();
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_generate_facturx");

  const result = unwrapStructured(
    await tool.handler(
      {
        invoice: { invoiceId: "FX-001" },
        flavor: "EN16931",
        language: "FRENCH",
      },
      { adapter },
    ),
  ) as Record<string, unknown>;

  assertEquals(calls[0].method, "generateFacturX");
  assertEquals(calls.length, 1);
  assertEquals(typeof result.generated_id, "string");
  assertEquals(result.filename, "FX-001.pdf");
});

// ── Emit via generated_id ────────────────────────────────

Deno.test("einvoice_invoice_submit - emits from generated_id", async () => {
  _clearStore();
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_invoice_submit");

  // Store a file first
  const file = new Uint8Array([10, 20, 30]);
  const id = storeGenerated(file, "test.pdf");

  await tool.handler({ generated_id: id }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "emitInvoice");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.filename, "test.pdf");
  assertEquals(arg.file instanceof Uint8Array, true);
});

Deno.test("einvoice_invoice_submit - throws for expired generated_id", async () => {
  _clearStore();
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_submit");

  const id = storeGenerated(new Uint8Array([1]), "old.xml");
  _expireEntry(id);

  await assertRejects(
    () => tool.handler({ generated_id: id }, { adapter }),
    Error,
    "Generated file expired or not found",
  );
});

// ── Generated Store ──────────────────────────────────────

Deno.test("generated-store - store and retrieve", () => {
  _clearStore();
  const file = new Uint8Array([1, 2, 3]);
  const id = storeGenerated(file, "invoice.pdf");

  const result = getGenerated(id);
  assertEquals(result !== null, true);
  assertEquals(result!.filename, "invoice.pdf");
  assertEquals(result!.file, file);
});

Deno.test("generated-store - retrieve consumes entry (one-shot)", () => {
  _clearStore();
  const id = storeGenerated(new Uint8Array([1]), "once.pdf");

  const first = getGenerated(id);
  assertEquals(first !== null, true);

  const second = getGenerated(id);
  assertEquals(second, null);
});

Deno.test("generated-store - expired entries return null", () => {
  _clearStore();
  const id = storeGenerated(new Uint8Array([1]), "exp.xml");
  _expireEntry(id);

  const result = getGenerated(id);
  assertEquals(result, null);
});

// ── Direction normalization is now in the adapter ──

Deno.test("einvoice_invoice_get - passes through normalized direction from adapter", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_get");

  // Mock adapter returns InvoiceDetail with direction already normalized
  const result = unwrapStructured(
    await tool.handler({ id: "inv-1" }, { adapter }),
  ) as Record<string, unknown>;
  assertEquals(result.direction, "received"); // from mock default
});

// einvoice_invoice_not_seen test removed — tool removed in v0.2.0

// ── M2 fix: TextEncoder produces correct UTF-8 bytes ────

Deno.test("einvoice_invoice_generate_cii - stores generated XML and returns generated_id", async () => {
  _clearStore();
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_invoice_generate_cii");

  const result = unwrapStructured(
    await tool.handler(
      { invoice: { invoiceId: "ACCENT-01" }, flavor: "EN16931" },
      { adapter },
    ),
  ) as Record<string, unknown>;

  // Adapter returns string (XML), tool stores it and returns generated_id
  const stored = getGenerated(result.generated_id as string);
  assertEquals(stored !== null, true);
  const decoded = new TextDecoder().decode(stored!.file);
  assertEquals(typeof decoded, "string");
  assertEquals(decoded.length > 0, true);
});

// ── Search _rowAction.idField matches formatted rows ─────

Deno.test("einvoice_invoice_search - _rowAction.idField is '_id' (matches formatted rows)", async () => {
  // Mock adapter returns normalized SearchInvoicesResult
  const { adapter } = createMockAdapter();
  // Override searchInvoices to return test data
  adapter.searchInvoices = async () => ({
    rows: [{
      id: "inv-42",
      invoiceNumber: "F-001",
      status: "DELIVERED",
      direction: "sent" as const,
      senderName: "Foo",
      receiverName: "Bar",
    }],
    count: 1,
  });
  const tool = findTool("einvoice_invoice_search");

  const result = unwrapStructured(
    await tool.handler({ q: "test" }, { adapter }),
  ) as Record<string, unknown>;
  const rowAction = result._rowAction as Record<string, string>;
  assertEquals(rowAction.idField, "_id");

  const data = result.data as Record<string, unknown>[];
  assertEquals(data[0]._id, "inv-42");
});

// ── _meta.ui ─────────────────────────────────────────────

Deno.test("einvoice_invoice_search has doclist-viewer UI", () => {
  const tool = findTool("einvoice_invoice_search");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});

Deno.test("einvoice_invoice_get has invoice-viewer UI", () => {
  const tool = findTool("einvoice_invoice_get");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/invoice-viewer");
});

// einvoice_invoice_not_seen UI test removed — tool removed in v0.2.0
