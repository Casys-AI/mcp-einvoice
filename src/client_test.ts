/**
 * EInvoiceToolsClient Tests
 *
 * Tests for the tools client: tool listing, MCP format conversion,
 * handler building, and tool execution.
 *
 * @module lib/einvoice/src/client_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { EInvoiceToolsClient } from "./client.ts";
import { createMockAdapter } from "./testing/helpers.ts";

// ── Tool Count ───────────────────────────────────────────

Deno.test("EInvoiceToolsClient - loads all tools by default", () => {
  const client = new EInvoiceToolsClient();
  assertEquals(client.count, 27);
});

Deno.test("EInvoiceToolsClient - filters by category", () => {
  const invoiceOnly = new EInvoiceToolsClient({ categories: ["invoice"] });
  assertEquals(invoiceOnly.count, 13);

  const statusOnly = new EInvoiceToolsClient({ categories: ["status"] });
  assertEquals(statusOnly.count, 4);

  const webhookOnly = new EInvoiceToolsClient({ categories: ["webhook"] });
  assertEquals(webhookOnly.count, 5);

  const directoryOnly = new EInvoiceToolsClient({ categories: ["directory"] });
  assertEquals(directoryOnly.count, 3);

  const reportingOnly = new EInvoiceToolsClient({ categories: ["reporting"] });
  assertEquals(reportingOnly.count, 2);
});

Deno.test("EInvoiceToolsClient - multi-category filter", () => {
  const client = new EInvoiceToolsClient({ categories: ["invoice", "status"] });
  assertEquals(client.count, 17); // 13 + 4
});

Deno.test("EInvoiceToolsClient - unknown category returns 0 tools", () => {
  const client = new EInvoiceToolsClient({ categories: ["nonexistent"] });
  assertEquals(client.count, 0);
});

// ── Tool Names ───────────────────────────────────────────

Deno.test("EInvoiceToolsClient - all tool names start with einvoice_", () => {
  const client = new EInvoiceToolsClient();
  for (const tool of client.listTools()) {
    assertEquals(
      tool.name.startsWith("einvoice_"),
      true,
      `Tool name "${tool.name}" should start with "einvoice_"`,
    );
  }
});

Deno.test("EInvoiceToolsClient - tool names are unique", () => {
  const client = new EInvoiceToolsClient();
  const names = client.listTools().map((t) => t.name);
  const unique = new Set(names);
  assertEquals(names.length, unique.size, "Duplicate tool names found");
});

// ── MCP Wire Format ──────────────────────────────────────

Deno.test("EInvoiceToolsClient.toMCPFormat() - returns correct shape", () => {
  const client = new EInvoiceToolsClient({ categories: ["webhook"] });
  const wire = client.toMCPFormat();

  assertEquals(wire.length, 5);
  for (const tool of wire) {
    assertEquals(typeof tool.name, "string");
    assertEquals(typeof tool.description, "string");
    assertEquals(typeof tool.inputSchema, "object");
    assertEquals(tool.inputSchema.type, "object");
    // handler should NOT be in wire format
    assertEquals("handler" in tool, false);
  }
});

Deno.test("EInvoiceToolsClient.toMCPFormat() - preserves _meta.ui", () => {
  const client = new EInvoiceToolsClient({ categories: ["invoice"] });
  const wire = client.toMCPFormat();

  const searchTool = wire.find((t) => t.name === "einvoice_invoice_search");
  assertEquals(searchTool?._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");

  const getTool = wire.find((t) => t.name === "einvoice_invoice_get");
  assertEquals(getTool?._meta?.ui?.resourceUri, "ui://mcp-einvoice/invoice-viewer");
});

// ── Handler Map ──────────────────────────────────────────

Deno.test("EInvoiceToolsClient.buildHandlersMap() - returns Map with all tools", () => {
  const { adapter } = createMockAdapter();
  const client = new EInvoiceToolsClient();
  const handlers = client.buildHandlersMap(adapter);

  assertEquals(handlers instanceof Map, true);
  assertEquals(handlers.size, client.count);

  for (const tool of client.listTools()) {
    assertEquals(handlers.has(tool.name), true, `Missing handler for ${tool.name}`);
  }
});

Deno.test("EInvoiceToolsClient.buildHandlersMap() - handlers call adapter", async () => {
  const { adapter, calls } = createMockAdapter({ found: true });
  const client = new EInvoiceToolsClient({ categories: ["invoice"] });
  const handlers = client.buildHandlersMap(adapter);

  const handler = handlers.get("einvoice_invoice_get");
  assertEquals(handler !== undefined, true);

  await handler!({ id: "test-inv" });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "getInvoice");
  assertEquals(calls[0].args, ["test-inv"]);
});

// ── Execute ──────────────────────────────────────────────

Deno.test("EInvoiceToolsClient.execute() - calls correct adapter method", async () => {
  const { adapter, calls } = createMockAdapter({ data: [] });
  const client = new EInvoiceToolsClient();

  await client.execute("einvoice_invoice_search", { status: "accepted" }, adapter);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "searchInvoices");
});

Deno.test("EInvoiceToolsClient.execute() - throws on unknown tool", async () => {
  const { adapter } = createMockAdapter();
  const client = new EInvoiceToolsClient();

  await assertRejects(
    () => client.execute("nonexistent_tool", {}, adapter),
    Error,
    "Unknown tool",
  );
});

// ── Validation ───────────────────────────────────────────

Deno.test("EInvoiceToolsClient - all tools have valid inputSchema", () => {
  const client = new EInvoiceToolsClient();
  for (const tool of client.listTools()) {
    assertEquals(tool.inputSchema.type, "object", `${tool.name} should have type: object`);
    assertEquals(
      typeof tool.inputSchema.properties,
      "object",
      `${tool.name} should have properties`,
    );
  }
});

Deno.test("EInvoiceToolsClient - all tools have non-empty descriptions", () => {
  const client = new EInvoiceToolsClient();
  for (const tool of client.listTools()) {
    assertEquals(
      tool.description.length > 10,
      true,
      `${tool.name} description too short: "${tool.description}"`,
    );
  }
});

Deno.test("EInvoiceToolsClient - all tools have a valid category", () => {
  const validCategories = new Set(["invoice", "directory", "status", "reporting", "webhook"]);
  const client = new EInvoiceToolsClient();
  for (const tool of client.listTools()) {
    assertEquals(
      validCategories.has(tool.category),
      true,
      `${tool.name} has invalid category "${tool.category}"`,
    );
  }
});
