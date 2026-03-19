/**
 * Status Tools Tests
 *
 * @module lib/einvoice/src/tools/status_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { statusTools } from "./status.ts";
import { createMockAdapter } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = statusTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("einvoice_status_send - maps code and message from input", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_status_send");

  await tool.handler({ invoice_id: "inv-1", code: "APPROVED", message: "OK" }, { adapter });

  assertEquals(calls[0].method, "sendStatus");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.invoiceId, "inv-1");
  assertEquals(arg.code, "APPROVED");
  assertEquals(arg.message, "OK");
});

Deno.test("einvoice_status_send - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_status_send");

  await assertRejects(() => tool.handler({ invoice_id: "inv-1" }, { adapter }), Error);
  await assertRejects(() => tool.handler({ code: "APPROVED" }, { adapter }), Error);
});

Deno.test("einvoice_status_history - calls adapter.getStatusHistory", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_status_history");

  await tool.handler({ invoice_id: "inv-1" }, { adapter });

  assertEquals(calls[0].method, "getStatusHistory");
  assertEquals(calls[0].args[0], "inv-1");
});

Deno.test("einvoice_status_history - throws without invoice_id", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_status_history");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'invoice_id' is required",
  );
});

// seen/notSeen tools removed in v0.2.0 — see docs/CHANGELOG.md

// ── H4 fix: status_history normalizes response shape ─────

Deno.test("einvoice_status_history - normalizes array response to { entries }", async () => {
  const mockResponse = [{ statusId: "s1", status: { code: "DELIVERED" } }];
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_status_history");

  const result = (await tool.handler({ invoice_id: "inv-1" }, { adapter })) as Record<string, unknown>;
  assertEquals(Array.isArray(result.entries), true);
  assertEquals((result.entries as unknown[]).length, 1);
});

Deno.test("einvoice_status_history - normalizes { data: [...] } wrapper", async () => {
  const mockResponse = { data: [{ statusId: "s1", status: { code: "APPROVED" } }] };
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_status_history");

  const result = (await tool.handler({ invoice_id: "inv-1" }, { adapter })) as Record<string, unknown>;
  assertEquals(Array.isArray(result.entries), true);
  assertEquals((result.entries as unknown[]).length, 1);
});

Deno.test("einvoice_status_history - normalizes { history: [...] } wrapper", async () => {
  const mockResponse = { history: [{ statusId: "s1", status: { code: "REFUSED" } }] };
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_status_history");

  const result = (await tool.handler({ invoice_id: "inv-1" }, { adapter })) as Record<string, unknown>;
  assertEquals(Array.isArray(result.entries), true);
});

Deno.test("einvoice_status_history - passes through { entries: [...] } as-is", async () => {
  const mockResponse = { entries: [{ statusId: "s1", status: { code: "DELIVERED" } }] };
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_status_history");

  const result = (await tool.handler({ invoice_id: "inv-1" }, { adapter })) as Record<string, unknown>;
  assertEquals(Array.isArray(result.entries), true);
});

Deno.test("einvoice_status_history - returns empty entries for unexpected shape", async () => {
  const mockResponse = "unexpected";
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_status_history");

  const result = (await tool.handler({ invoice_id: "inv-1" }, { adapter })) as Record<string, unknown>;
  assertEquals(result.entries, []);
});

// ── _meta.ui ─────────────────────────────────────────────

// einvoice_status_not_seen UI test removed — tool removed in v0.2.0
