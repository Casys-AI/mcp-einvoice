/**
 * Directory Tools Tests
 *
 * @module lib/einvoice/src/tools/directory_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { directoryTools } from "./directory.ts";
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = directoryTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// Lucene wrapping tests moved to adapter_test.ts (Iopole-specific)
// Tool now passes raw query to adapter — adapter decides how to wrap it.

Deno.test("einvoice_directory_fr_search - passes raw query to adapter", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await tool.handler({ q: "43446637100011", offset: 0, limit: 20 }, { adapter });

  assertEquals(calls[0].method, "searchDirectoryFr");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, "43446637100011"); // raw, no Lucene wrapping
  assertEquals(arg.offset, 0);
  assertEquals(arg.limit, 20);
});

Deno.test("einvoice_directory_fr_search - throws without q", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'q' query is required",
  );
});

Deno.test("einvoice_directory_fr_search - formats rows with French columns", async () => {
  const { adapter } = createMockAdapter();
  // Override to return normalized data
  adapter.searchDirectoryFr = async () => ({
    rows: [{
      entityId: "be-123",
      name: "Casys AI",
      type: "LEGAL_UNIT",
      siren: "434466371",
      siret: "43446637100011",
      country: "FR",
      identifiers: [{ scheme: "0009", value: "434466371" }],
    }],
    count: 1,
  });
  const tool = findTool("einvoice_directory_fr_search");

  const result = unwrapStructured(await tool.handler({ q: "Casys AI" }, { adapter })) as Record<string, unknown>;

  assertEquals(result.count, 1);
  const data = result.data as Record<string, unknown>[];
  assertEquals(data.length, 1);
  // Priority columns only (Type, SIREN, Pays in drill-down)
  assertEquals(data[0]["Nom"], "Casys AI");
  assertEquals(data[0]["SIRET"], "43446637100011");
  assertEquals(data[0]["_id"], "be-123");
});

Deno.test("einvoice_directory_fr_search - handles OFFICE type", async () => {
  const { adapter } = createMockAdapter();
  adapter.searchDirectoryFr = async () => ({
    rows: [{ entityId: "be-456", name: "Bureau Paris", type: "OFFICE", siret: "43446637100029", country: "FR" }],
    count: 1,
  });
  const tool = findTool("einvoice_directory_fr_search");

  const result = unwrapStructured(await tool.handler({ q: "Bureau" }, { adapter })) as Record<string, unknown>;
  const data = result.data as Record<string, unknown>[];
  // Priority columns — Type not shown in table (drill-down only)
  assertEquals(data[0]["SIRET"], "43446637100029");
  assertEquals(data[0]["Nom"], "Bureau Paris");
});

Deno.test("einvoice_directory_int_search - calls adapter.searchDirectoryInt with value", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_int_search");

  await tool.handler({ value: "FR12345678901" }, { adapter });

  assertEquals(calls[0].method, "searchDirectoryInt");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.value, "FR12345678901");
});

Deno.test("einvoice_directory_int_search - throws without value", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_directory_int_search");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'value' is required",
  );
});

Deno.test("einvoice_directory_peppol_check - calls adapter.checkPeppolParticipant", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_peppol_check");

  await tool.handler({ scheme: "iso6523-actorid-upis", value: "0208:FR123" }, { adapter });

  assertEquals(calls[0].method, "checkPeppolParticipant");
  assertEquals(calls[0].args[0], "iso6523-actorid-upis");
  assertEquals(calls[0].args[1], "0208:FR123");
});

Deno.test("einvoice_directory_peppol_check - throws without scheme or value", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_directory_peppol_check");

  await assertRejects(
    () => tool.handler({ scheme: "test" }, { adapter }),
    Error,
    "'scheme' and 'value' are required",
  );
});

Deno.test("einvoice_directory_fr_search has doclist-viewer UI", () => {
  const tool = findTool("einvoice_directory_fr_search");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});

Deno.test("einvoice_directory_int_search has doclist-viewer UI", () => {
  const tool = findTool("einvoice_directory_int_search");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});

Deno.test("einvoice_directory_peppol_check has no UI viewer", () => {
  const tool = findTool("einvoice_directory_peppol_check");
  assertEquals(tool._meta, undefined);
});
