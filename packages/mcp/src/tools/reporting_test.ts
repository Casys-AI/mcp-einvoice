/**
 * Reporting Tools Tests
 *
 * @module lib/einvoice/src/tools/reporting_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { reportingTools } from "./reporting.ts";
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = reportingTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("einvoice_reporting_invoice_transaction - calls adapter", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_reporting_invoice_transaction");

  await tool.handler({
    identifier_scheme: "0009",
    identifier_value: "43446637100011",
    transaction: { amount: 1000 },
  }, { adapter });

  assertEquals(calls[0].method, "reportInvoiceTransaction");
  assertEquals(calls[0].args[0], "0009");
  assertEquals(calls[0].args[1], "43446637100011");
  assertEquals(calls[0].args[2], { amount: 1000 });
});

Deno.test("einvoice_reporting_invoice_transaction - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_reporting_invoice_transaction");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'identifier_scheme', 'identifier_value', and 'transaction' are required",
  );
});

Deno.test("einvoice_reporting_transaction - calls adapter with scheme/value", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_reporting_transaction");

  await tool.handler({
    identifier_scheme: "0009",
    identifier_value: "43446637100011",
    transaction: { type: "b2c" },
  }, { adapter });

  assertEquals(calls[0].method, "reportTransaction");
  assertEquals(calls[0].args[0], "0009");
  assertEquals(calls[0].args[1], "43446637100011");
  assertEquals(calls[0].args[2], { type: "b2c" });
});

Deno.test("einvoice_reporting_transaction - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_reporting_transaction");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'identifier_scheme', 'identifier_value', and 'transaction' are required",
  );
  await assertRejects(
    () => tool.handler({ transaction: { type: "b2c" } }, { adapter }),
    Error,
    "'identifier_scheme', 'identifier_value', and 'transaction' are required",
  );
});

// ── structuredContent tests ─────────────────────────────

Deno.test("einvoice_reporting_invoice_transaction - returns action-result structuredContent", async () => {
  const { adapter } = createMockAdapter({ guid: "abc-123" });
  const tool = findTool("einvoice_reporting_invoice_transaction");

  const result = await tool.handler(
    { identifier_scheme: "0009", identifier_value: "43446637100011", transaction: { amount: 1000 } },
    { adapter },
  ) as Record<string, unknown>;

  assertEquals(typeof result.content, "string");
  const sc = unwrapStructured(result);
  assertEquals(sc.action, "Déclaration e-reporting");
  assertEquals(sc.status, "success");
  assertEquals(sc.title, "Transaction facture déclarée");
});

Deno.test("einvoice_reporting_invoice_transaction has action-result UI", () => {
  const tool = findTool("einvoice_reporting_invoice_transaction");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});

Deno.test("einvoice_reporting_transaction - returns action-result structuredContent", async () => {
  const { adapter } = createMockAdapter({ guid: "def-456" });
  const tool = findTool("einvoice_reporting_transaction");

  const result = await tool.handler({
    identifier_scheme: "0009",
    identifier_value: "43446637100011",
    transaction: { type: "b2c" },
  }, { adapter }) as Record<string, unknown>;

  assertEquals(typeof result.content, "string");
  assertEquals((result.content as string).includes("0009:43446637100011"), true);
  const sc = unwrapStructured(result);
  assertEquals(sc.action, "Déclaration e-reporting");
  assertEquals(sc.status, "success");
  assertEquals((sc.title as string).includes("0009:43446637100011"), true);
  assertEquals(typeof sc.details, "object");
});

Deno.test("einvoice_reporting_transaction has action-result UI", () => {
  const tool = findTool("einvoice_reporting_transaction");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});
