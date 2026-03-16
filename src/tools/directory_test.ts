/**
 * Directory Tools Tests
 *
 * @module lib/einvoice/src/tools/directory_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { directoryTools } from "./directory.ts";
import { createMockAdapter } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = directoryTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("einvoice_directory_fr_search - auto-wraps 14-digit SIRET", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await tool.handler({ q: "43446637100011", offset: 0, limit: 20 }, { adapter });

  assertEquals(calls[0].method, "searchDirectoryFr");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, 'siret:"43446637100011"');
  assertEquals(arg.offset, 0);
  assertEquals(arg.limit, 20);
});

Deno.test("einvoice_directory_fr_search - auto-wraps 9-digit SIREN", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await tool.handler({ q: "434466371" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, 'siren:"434466371"');
});

Deno.test("einvoice_directory_fr_search - auto-wraps FR VAT number", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await tool.handler({ q: "FR12345678901" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, 'vatNumber:"FR12345678901"');
});

Deno.test("einvoice_directory_fr_search - auto-wraps company name", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await tool.handler({ q: "Casys AI" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, 'name:"*Casys AI*"');
});

Deno.test("einvoice_directory_fr_search - passes through existing Lucene syntax", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_directory_fr_search");

  await tool.handler({ q: 'siret:"43446637100011" AND name:"Casys"' }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.q, 'siret:"43446637100011" AND name:"Casys"');
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

Deno.test("einvoice_directory_fr_search - formats data rows with French columns", async () => {
  const mockResponse = {
    meta: { count: 1 },
    data: [
      {
        businessEntityId: "be-123",
        name: "Casys AI",
        type: "LEGAL_UNIT",
        identifiers: [{ scheme: "0009", value: "434466371" }],
        countryIdentifier: { siren: "434466371", siret: "43446637100011" },
        identifierScheme: "0009",
        identifierValue: "434466371",
        scope: "FR",
      },
    ],
  };
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_directory_fr_search");

  const result = await tool.handler({ q: "Casys AI" }, { adapter }) as Record<string, unknown>;

  assertEquals(result.count, 1);
  const data = result.data as Record<string, unknown>[];
  assertEquals(data.length, 1);
  assertEquals(data[0]["Nom"], "Casys AI");
  assertEquals(data[0]["Type"], "Entité juridique");
  assertEquals(data[0]["SIREN"], "434466371");
  assertEquals(data[0]["SIRET"], "43446637100011");
  assertEquals(data[0]["Pays"], "FR");
  assertEquals(data[0]["_id"], "be-123");
  // Internal fields are hidden under _identifiers
  assertEquals(Array.isArray(data[0]["_identifiers"]), true);
  // Raw fields are stripped
  assertEquals(data[0]["businessEntityId"], undefined);
  assertEquals(data[0]["identifierScheme"], undefined);
  assertEquals(data[0]["scope"], undefined);
});

Deno.test("einvoice_directory_fr_search - handles OFFICE type", async () => {
  const mockResponse = {
    data: [{ businessEntityId: "be-456", name: "Bureau Paris", type: "OFFICE", countryIdentifier: { siret: "43446637100029" } }],
  };
  const { adapter } = createMockAdapter(mockResponse);
  const tool = findTool("einvoice_directory_fr_search");

  const result = await tool.handler({ q: "Bureau" }, { adapter }) as Record<string, unknown>;
  const data = result.data as Record<string, unknown>[];
  assertEquals(data[0]["Type"], "Établissement");
  assertEquals(data[0]["SIRET"], "43446637100029");
  assertEquals(data[0]["SIREN"], "—");
});

Deno.test("einvoice_directory_fr_search has doclist-viewer UI", () => {
  const tool = findTool("einvoice_directory_fr_search");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});

Deno.test("einvoice_directory_int_search has doclist-viewer UI", () => {
  const tool = findTool("einvoice_directory_int_search");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});

// ── M5 fix: peppol_check has no viewer (boolean result, not card-shaped)

Deno.test("einvoice_directory_peppol_check has no UI viewer", () => {
  const tool = findTool("einvoice_directory_peppol_check");
  assertEquals(tool._meta, undefined);
});
