/**
 * Reporting Tools Tests
 *
 * @module lib/einvoice/src/tools/reporting_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { reportingTools } from "./reporting.ts";
import { createMockAdapter } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = reportingTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("einvoice_reporting_invoice_transaction - calls adapter", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_reporting_invoice_transaction");

  await tool.handler({ transaction: { amount: 1000 } }, { adapter });

  assertEquals(calls[0].method, "reportInvoiceTransaction");
  assertEquals(calls[0].args[0], { amount: 1000 });
});

Deno.test("einvoice_reporting_invoice_transaction - throws without transaction", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_reporting_invoice_transaction");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'transaction' is required",
  );
});

Deno.test("einvoice_reporting_transaction - calls adapter with businessEntityId", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_reporting_transaction");

  await tool.handler({
    business_entity_id: "be-1",
    transaction: { type: "b2c" },
  }, { adapter });

  assertEquals(calls[0].method, "reportTransaction");
  assertEquals(calls[0].args[0], "be-1");
  assertEquals(calls[0].args[1], { type: "b2c" });
});

Deno.test("einvoice_reporting_transaction - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_reporting_transaction");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'business_entity_id' and 'transaction' are required",
  );
  await assertRejects(
    () => tool.handler({ transaction: { type: "b2c" } }, { adapter }),
    Error,
    "'business_entity_id' and 'transaction' are required",
  );
});
