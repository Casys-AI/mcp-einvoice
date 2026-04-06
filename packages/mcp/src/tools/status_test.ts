/**
 * Status Tools Tests
 *
 * @module lib/einvoice/src/tools/status_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { statusTools } from "./status.ts";
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = statusTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("einvoice_status_send - maps code and message from input", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_status_send");

  await tool.handler({ invoice_id: "inv-1", code: "APPROVED", message: "OK" }, {
    adapter,
  });

  assertEquals(calls[0].method, "sendStatus");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.invoiceId, "inv-1");
  assertEquals(arg.code, "APPROVED");
  assertEquals(arg.message, "OK");
});

Deno.test("einvoice_status_send - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_status_send");

  await assertRejects(
    () => tool.handler({ invoice_id: "inv-1" }, { adapter }),
    Error,
  );
  await assertRejects(
    () => tool.handler({ code: "APPROVED" }, { adapter }),
    Error,
  );
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

// ── status_history now passes through normalized StatusHistoryResult from adapter ─────

Deno.test("einvoice_status_history - passes through adapter StatusHistoryResult", async () => {
  const { adapter } = createMockAdapter();
  adapter.getStatusHistory = (_id) =>
    Promise.resolve({ entries: [{ date: "2026-03-19", code: "DELIVERED" }] });
  const tool = findTool("einvoice_status_history");

  const result = unwrapStructured(
    await tool.handler({ invoice_id: "inv-1" }, { adapter }),
  ) as Record<string, unknown>;
  assertEquals(Array.isArray(result.entries), true);
  assertEquals((result.entries as unknown[]).length, 1);
});

Deno.test("einvoice_status_history - returns empty entries when adapter has none", async () => {
  const { adapter } = createMockAdapter();
  adapter.getStatusHistory = (_id) => Promise.resolve({ entries: [] });
  const tool = findTool("einvoice_status_history");

  const result = unwrapStructured(
    await tool.handler({ invoice_id: "inv-1" }, { adapter }),
  ) as Record<string, unknown>;
  assertEquals(result.entries, []);
});

// ── _meta.ui ─────────────────────────────────────────────

// einvoice_status_not_seen UI test removed — tool removed in v0.2.0

// ── status_send structuredContent ─────────────────────────

Deno.test("einvoice_status_send - returns action-result structuredContent", async () => {
  const { adapter } = createMockAdapter({ ok: true });
  const tool = findTool("einvoice_status_send");

  const result = await tool.handler(
    { invoice_id: "inv-1", code: "APPROVED" },
    { adapter },
  ) as Record<string, unknown>;

  assertEquals(typeof result.content, "string");
  assertEquals((result.content as string).includes("APPROVED"), true);
  assertEquals((result.content as string).includes("inv-1"), true);

  const sc = unwrapStructured(result);
  assertEquals(sc.action, "Envoi statut");
  assertEquals(sc.status, "success");
  assertEquals(sc.title, "APPROVED → facture inv-1");
  assertEquals(typeof sc.details, "object");

  // nextAction
  const next = sc.nextAction as Record<string, unknown>;
  assertEquals(next.toolName, "einvoice_status_history");
  assertEquals((next.arguments as Record<string, unknown>).invoice_id, "inv-1");
});

Deno.test("einvoice_status_send has action-result UI", () => {
  const tool = findTool("einvoice_status_send");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});
