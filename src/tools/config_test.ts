/**
 * Config Tools Tests
 *
 * Tests that config tools correctly call adapter methods,
 * reshape data, validate inputs, and propagate errors.
 *
 * @module lib/einvoice/src/tools/config_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { configTools } from "./config.ts";
import { createMockAdapter, unwrapStructured } from "../testing/helpers.ts";
import { NotSupportedError } from "../adapters/shared/errors.ts";

function findTool(name: string) {
  const tool = configTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── Customer ID ───────────────────────────────────────────

Deno.test("einvoice_config_customer_id - calls adapter.getCustomerId", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_customer_id");

  await tool.handler({}, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "getCustomerId");
});

Deno.test("einvoice_config_customer_id - returns adapter response", async () => {
  const { adapter } = createMockAdapter({ customerId: "cust-abc" });
  const tool = findTool("einvoice_config_customer_id");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;
  assertEquals(result.customerId, "cust-abc");
});

Deno.test("einvoice_config_customer_id - propagates NotSupportedError", async () => {
  const { adapter } = createMockAdapter();
  adapter.getCustomerId = () =>
    Promise.reject(
      new NotSupportedError("mock", "getCustomerId", "Not available"),
    );
  const tool = findTool("einvoice_config_customer_id");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    NotSupportedError,
  );
});

// ── List Business Entities ────────────────────────────────

Deno.test("einvoice_config_entities_list - calls adapter.listBusinessEntities", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entities_list");

  await tool.handler({}, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "listBusinessEntities");
});

Deno.test("einvoice_config_entities_list - reshapes rows with Nom, SIRET, Type columns", async () => {
  const { adapter } = createMockAdapter();
  adapter.listBusinessEntities = async () => ({
    rows: [
      {
        entityId: "ent-1",
        name: "ACME Corp",
        siret: "12345678901234",
        type: "LEGAL_UNIT",
      },
      {
        entityId: "ent-2",
        name: "ACME Office",
        siret: "12345678901235",
        type: "OFFICE",
      },
    ],
    count: 2,
  });
  const tool = findTool("einvoice_config_entities_list");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;
  const data = result.data as Record<string, unknown>[];

  assertEquals(data.length, 2);
  assertEquals(data[0]._id, "ent-1");
  assertEquals(data[0]["Nom"], "ACME Corp");
  assertEquals(data[0]["SIRET"], "12345678901234");
  assertEquals(data[0]["Type"], "Entité juridique");
  assertEquals(data[1]._id, "ent-2");
  assertEquals(data[1]["Type"], "Établissement");
});

Deno.test("einvoice_config_entities_list - falls back to '—' for missing fields", async () => {
  const { adapter } = createMockAdapter();
  adapter.listBusinessEntities = async () => ({
    rows: [{ entityId: "ent-3" }],
    count: 1,
  });
  const tool = findTool("einvoice_config_entities_list");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;
  const data = result.data as Record<string, unknown>[];

  assertEquals(data[0]["Nom"], "—");
  assertEquals(data[0]["SIRET"], "—");
  assertEquals(data[0]["Type"], "—");
});

Deno.test("einvoice_config_entities_list - uses raw type when not in label map", async () => {
  const { adapter } = createMockAdapter();
  adapter.listBusinessEntities = async () => ({
    rows: [{ entityId: "ent-4", type: "UNKNOWN_TYPE" }],
    count: 1,
  });
  const tool = findTool("einvoice_config_entities_list");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;
  const data = result.data as Record<string, unknown>[];

  assertEquals(data[0]["Type"], "UNKNOWN_TYPE");
});

Deno.test("einvoice_config_entities_list - includes _title and count", async () => {
  const { adapter } = createMockAdapter();
  adapter.listBusinessEntities = async () => ({
    rows: [{ entityId: "ent-1", name: "Foo" }],
    count: 42,
  });
  const tool = findTool("einvoice_config_entities_list");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;

  assertEquals(result._title, "Entités opérateur");
  assertEquals(result.count, 42);
});

Deno.test("einvoice_config_entities_list - _rowAction points to entity_get with correct fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entities_list");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;
  const rowAction = result._rowAction as Record<string, string>;

  assertEquals(rowAction.toolName, "einvoice_config_entity_get");
  assertEquals(rowAction.idField, "_id");
  assertEquals(rowAction.argName, "id");
});

Deno.test("einvoice_config_entities_list - returns empty data array when no rows", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entities_list");

  const result = unwrapStructured(
    await tool.handler({}, { adapter }),
  ) as Record<string, unknown>;
  const data = result.data as Record<string, unknown>[];

  assertEquals(data.length, 0);
  assertEquals(result.count, 0);
});

// ── Get Business Entity ───────────────────────────────────

Deno.test("einvoice_config_entity_get - calls adapter.getBusinessEntity with id", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_get");

  await tool.handler({ id: "ent-xyz" }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "getBusinessEntity");
  assertEquals(calls[0].args[0], "ent-xyz");
});

Deno.test("einvoice_config_entity_get - throws when id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_get");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'id' is required",
  );
});

Deno.test("einvoice_config_entity_get - propagates NotSupportedError", async () => {
  const { adapter } = createMockAdapter();
  adapter.getBusinessEntity = () =>
    Promise.reject(
      new NotSupportedError("mock", "getBusinessEntity", "Not available"),
    );
  const tool = findTool("einvoice_config_entity_get");

  await assertRejects(
    () => tool.handler({ id: "ent-1" }, { adapter }),
    NotSupportedError,
  );
});

// ── Create Legal Unit ─────────────────────────────────────

Deno.test("einvoice_config_entity_create_legal - calls adapter.createLegalUnit with correct payload", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_legal");

  await tool.handler({
    siren: "123456789",
    name: "ACME SA",
    country: "FR",
    scope: "PRIVATE_TAX_PAYER",
  }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "createLegalUnit");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.identifierScheme, "0002");
  assertEquals(arg.identifierValue, "123456789");
  assertEquals(arg.name, "ACME SA");
  assertEquals(arg.country, "FR");
  assertEquals(arg.scope, "PRIVATE_TAX_PAYER");
});

Deno.test("einvoice_config_entity_create_legal - defaults country to FR and scope to PRIMARY", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_legal");

  await tool.handler({ siren: "987654321" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.country, "FR");
  assertEquals(arg.scope, "PRIMARY");
});

Deno.test("einvoice_config_entity_create_legal - throws when siren is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_legal");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'siren' is required",
  );
});

Deno.test("einvoice_config_entity_create_legal - propagates NotSupportedError", async () => {
  const { adapter } = createMockAdapter();
  adapter.createLegalUnit = () =>
    Promise.reject(
      new NotSupportedError("mock", "createLegalUnit", "Not available"),
    );
  const tool = findTool("einvoice_config_entity_create_legal");

  await assertRejects(
    () => tool.handler({ siren: "123456789" }, { adapter }),
    NotSupportedError,
  );
});

// ── Create Office ─────────────────────────────────────────

Deno.test("einvoice_config_entity_create_office - calls adapter.createOffice with correct payload", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_office");

  await tool.handler({
    siret: "12345678901234",
    legalUnitId: "ent-1",
    name: "Siege",
    scope: "PUBLIC",
  }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "createOffice");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.identifierScheme, "0009");
  assertEquals(arg.identifierValue, "12345678901234");
  assertEquals(arg.legalBusinessEntityId, "ent-1");
  assertEquals(arg.name, "Siege");
  assertEquals(arg.scope, "PUBLIC");
});

Deno.test("einvoice_config_entity_create_office - defaults scope to PRIMARY", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_office");

  await tool.handler({ siret: "12345678901234", legalUnitId: "ent-1" }, {
    adapter,
  });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.scope, "PRIMARY");
});

Deno.test("einvoice_config_entity_create_office - throws when siret is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_office");

  await assertRejects(
    () => tool.handler({ legalUnitId: "ent-1" }, { adapter }),
    Error,
    "'siret' and 'legalUnitId' are required",
  );
});

Deno.test("einvoice_config_entity_create_office - throws when legalUnitId is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_create_office");

  await assertRejects(
    () => tool.handler({ siret: "12345678901234" }, { adapter }),
    Error,
    "'siret' and 'legalUnitId' are required",
  );
});

// ── Configure Business Entity ─────────────────────────────

Deno.test("einvoice_config_entity_configure - calls adapter.configureBusinessEntity with vatRegime", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_configure");

  await tool.handler({
    entity_id: "ent-1",
    vat_regime: "REAL_MONTHLY_TAX_REGIME",
  }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "configureBusinessEntity");
  assertEquals(calls[0].args[0], "ent-1");
  const config = calls[0].args[1] as Record<string, unknown>;
  assertEquals(config.vatRegime, "REAL_MONTHLY_TAX_REGIME");
});

Deno.test("einvoice_config_entity_configure - omits vatRegime when not provided", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_configure");

  await tool.handler({ entity_id: "ent-1" }, { adapter });

  const config = calls[0].args[1] as Record<string, unknown>;
  assertEquals(Object.keys(config).includes("vatRegime"), false);
});

Deno.test("einvoice_config_entity_configure - throws when entity_id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_configure");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'entity_id' is required",
  );
});

Deno.test("einvoice_config_entity_configure - propagates NotSupportedError", async () => {
  const { adapter } = createMockAdapter();
  adapter.configureBusinessEntity = () =>
    Promise.reject(
      new NotSupportedError("mock", "configureBusinessEntity", "Not available"),
    );
  const tool = findTool("einvoice_config_entity_configure");

  await assertRejects(
    () => tool.handler({ entity_id: "ent-1" }, { adapter }),
    NotSupportedError,
  );
});

// ── Create Identifier by Scheme ───────────────────────────

Deno.test("einvoice_config_identifier_create_by_scheme - calls adapter with correct args", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_create_by_scheme");

  await tool.handler({
    lookup_scheme: "0009",
    lookup_value: "12345678901234",
    new_scheme: "0225",
    new_value: "123456789012345",
  }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "createIdentifierByScheme");
  assertEquals(calls[0].args[0], "0009");
  assertEquals(calls[0].args[1], "12345678901234");
  const newId = calls[0].args[2] as Record<string, unknown>;
  assertEquals(newId.scheme, "0225");
  assertEquals(newId.value, "123456789012345");
});

Deno.test("einvoice_config_identifier_create_by_scheme - throws when any field is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_create_by_scheme");

  await assertRejects(
    () =>
      tool.handler({ lookup_scheme: "0009", lookup_value: "123" }, { adapter }),
    Error,
    "all fields are required",
  );
});

Deno.test("einvoice_config_identifier_create_by_scheme - propagates NotSupportedError", async () => {
  const { adapter } = createMockAdapter();
  adapter.createIdentifierByScheme = () =>
    Promise.reject(
      new NotSupportedError(
        "mock",
        "createIdentifierByScheme",
        "Not available",
      ),
    );
  const tool = findTool("einvoice_config_identifier_create_by_scheme");

  await assertRejects(
    () =>
      tool.handler({
        lookup_scheme: "0009",
        lookup_value: "12345678901234",
        new_scheme: "0225",
        new_value: "123456789012345",
      }, { adapter }),
    NotSupportedError,
  );
});

// ── Create Identifier ─────────────────────────────────────

Deno.test("einvoice_config_identifier_create - calls adapter.createIdentifier", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_create");

  await tool.handler({
    entity_id: "ent-1",
    scheme: "0009",
    value: "12345678901234",
    type: "ROUTING_CODE",
  }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "createIdentifier");
  assertEquals(calls[0].args[0], "ent-1");
  const payload = calls[0].args[1] as Record<string, unknown>;
  assertEquals(payload.scheme, "0009");
  assertEquals(payload.value, "12345678901234");
  assertEquals(payload.type, "ROUTING_CODE");
});

Deno.test("einvoice_config_identifier_create - throws when entity_id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_create");

  await assertRejects(
    () =>
      tool.handler({ scheme: "0009", value: "123", type: "ROUTING_CODE" }, {
        adapter,
      }),
    Error,
    "'entity_id', 'scheme', 'value', and 'type' are required",
  );
});

Deno.test("einvoice_config_identifier_create - throws when scheme is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_create");

  await assertRejects(
    () =>
      tool.handler({ entity_id: "ent-1", value: "123", type: "ROUTING_CODE" }, {
        adapter,
      }),
    Error,
    "'entity_id', 'scheme', 'value', and 'type' are required",
  );
});

// ── Delete Identifier ─────────────────────────────────────

Deno.test("einvoice_config_identifier_delete - calls adapter.deleteIdentifier", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_delete");

  await tool.handler({ identifier_id: "id-uuid-123" }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "deleteIdentifier");
  assertEquals(calls[0].args[0], "id-uuid-123");
});

Deno.test("einvoice_config_identifier_delete - throws when identifier_id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_identifier_delete");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'identifier_id' is required",
  );
});

// ── Enroll French ─────────────────────────────────────────

Deno.test("einvoice_config_enroll_fr - calls adapter.enrollFrench with siret and siren", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_enroll_fr");

  await tool.handler({ siret: "12345678901234", siren: "123456789" }, {
    adapter,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "enrollFrench");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.siret, "12345678901234");
  assertEquals(arg.siren, "123456789");
});

Deno.test("einvoice_config_enroll_fr - extracts siren from siret when omitted", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_enroll_fr");

  await tool.handler({ siret: "12345678901234" }, { adapter });

  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.siren, "123456789");
});

Deno.test("einvoice_config_enroll_fr - throws when siret is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_enroll_fr");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'siret' is required",
  );
});

// ── Delete Business Entity ────────────────────────────────

Deno.test("einvoice_config_entity_delete - calls adapter.deleteBusinessEntity", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_delete");

  await tool.handler({ id: "ent-del" }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "deleteBusinessEntity");
  assertEquals(calls[0].args[0], "ent-del");
});

Deno.test("einvoice_config_entity_delete - throws when id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_delete");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'id' is required",
  );
});

// ── Claim Business Entity ─────────────────────────────────

Deno.test("einvoice_config_entity_claim - calls adapter.claimBusinessEntityByIdentifier", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_claim");

  await tool.handler({ scheme: "0009", value: "12345678901234" }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "claimBusinessEntityByIdentifier");
  assertEquals(calls[0].args[0], "0009");
  assertEquals(calls[0].args[1], "12345678901234");
});

Deno.test("einvoice_config_entity_claim - throws when scheme is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_claim");

  await assertRejects(
    () => tool.handler({ value: "12345678901234" }, { adapter }),
    Error,
    "'scheme' and 'value' are required",
  );
});

Deno.test("einvoice_config_entity_claim - throws when value is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_entity_claim");

  await assertRejects(
    () => tool.handler({ scheme: "0009" }, { adapter }),
    Error,
    "'scheme' and 'value' are required",
  );
});

// ── Register Network ──────────────────────────────────────

Deno.test("einvoice_config_network_register - calls adapter.registerNetwork", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_network_register");

  await tool.handler({ identifier_id: "id-uuid", network: "DOMESTIC_FR" }, {
    adapter,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "registerNetwork");
  assertEquals(calls[0].args[0], "id-uuid");
  assertEquals(calls[0].args[1], "DOMESTIC_FR");
});

Deno.test("einvoice_config_network_register - throws when identifier_id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_network_register");

  await assertRejects(
    () => tool.handler({ network: "DOMESTIC_FR" }, { adapter }),
    Error,
    "'identifier_id' and 'network' are required",
  );
});

Deno.test("einvoice_config_network_register - throws when network is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_network_register");

  await assertRejects(
    () => tool.handler({ identifier_id: "id-uuid" }, { adapter }),
    Error,
    "'identifier_id' and 'network' are required",
  );
});

// ── Register Network by Scheme ────────────────────────────

Deno.test("einvoice_config_network_register_by_id - calls adapter.registerNetworkByScheme", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_network_register_by_id");

  await tool.handler({
    scheme: "0009",
    value: "12345678901234",
    network: "DOMESTIC_FR",
  }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "registerNetworkByScheme");
  assertEquals(calls[0].args[0], "0009");
  assertEquals(calls[0].args[1], "12345678901234");
  assertEquals(calls[0].args[2], "DOMESTIC_FR");
});

Deno.test("einvoice_config_network_register_by_id - throws when any field is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_network_register_by_id");

  await assertRejects(
    () =>
      tool.handler({ scheme: "0009", value: "12345678901234" }, { adapter }),
    Error,
    "'scheme', 'value', and 'network' are required",
  );
});

// ── Unregister Network ────────────────────────────────────

Deno.test("einvoice_config_network_unregister - calls adapter.unregisterNetwork", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_network_unregister");

  await tool.handler({ directory_id: "dir-uuid" }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "unregisterNetwork");
  assertEquals(calls[0].args[0], "dir-uuid");
});

Deno.test("einvoice_config_network_unregister - throws when directory_id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_network_unregister");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'directory_id' is required",
  );
});

// ── Delete Claim ──────────────────────────────────────────

Deno.test("einvoice_config_claim_delete - calls adapter.deleteClaim", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_config_claim_delete");

  await tool.handler({ entity_id: "ent-1" }, { adapter });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "deleteClaim");
  assertEquals(calls[0].args[0], "ent-1");
});

Deno.test("einvoice_config_claim_delete - throws when entity_id is missing", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_config_claim_delete");

  await assertRejects(
    () => tool.handler({}, { adapter }),
    Error,
    "'entity_id' is required",
  );
});

// ── _meta.ui ──────────────────────────────────────────────

Deno.test("einvoice_config_entities_list has doclist-viewer UI", () => {
  const tool = findTool("einvoice_config_entities_list");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});

Deno.test("einvoice_config_entity_get has directory-card UI", () => {
  const tool = findTool("einvoice_config_entity_get");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/directory-card");
});

Deno.test("einvoice_config_enroll_fr has action-result UI", () => {
  const tool = findTool("einvoice_config_enroll_fr");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});

Deno.test("einvoice_config_identifier_create has action-result UI", () => {
  const tool = findTool("einvoice_config_identifier_create");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});

Deno.test("einvoice_config_identifier_create_by_scheme has action-result UI", () => {
  const tool = findTool("einvoice_config_identifier_create_by_scheme");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});

Deno.test("einvoice_config_network_register has action-result UI", () => {
  const tool = findTool("einvoice_config_network_register");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});

Deno.test("einvoice_config_network_register_by_id has action-result UI", () => {
  const tool = findTool("einvoice_config_network_register_by_id");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});

Deno.test("einvoice_config_entity_configure has action-result UI", () => {
  const tool = findTool("einvoice_config_entity_configure");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/action-result");
});
