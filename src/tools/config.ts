/**
 * E-Invoice Operator Configuration Tools
 *
 * MCP tools for managing operator business entities, enrollment,
 * and configuration. Required for e-invoicing to work — entities
 * must be enrolled before they can send or receive invoices.
 *
 * PA-agnostic — calls adapter methods.
 *
 * @module lib/einvoice/tools/config
 */

import type { EInvoiceTool } from "./types.ts";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  LEGAL_UNIT: "Entité juridique",
  OFFICE: "Établissement",
};

export const configTools: EInvoiceTool[] = [
  // ── Customer ID ──────────────────────────────────────

  {
    name: "einvoice_config_customer_id",
    requires: ["getCustomerId"],
    description: "Get the current operator customer ID. " +
      "This is your unique operator identifier on the e-invoicing platform.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      return await ctx.adapter.getCustomerId();
    },
  },

  // ── List Business Entities ───────────────────────────

  {
    name: "einvoice_config_entities_list",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    requires: ["listBusinessEntities"],
    description:
      "List all business entities managed by your operator account. " +
      "Shows which companies/offices are enrolled for e-invoicing under your management. " +
      "If this list is empty, you need to enroll entities before sending invoices.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      const { rows, count } = await ctx.adapter.listBusinessEntities();
      const viewerData = {
        data: rows.map((r) => ({
          _id: r.entityId,
          "Nom": r.name ?? "—",
          "SIRET": r.siret ?? "—",
          "Type": ENTITY_TYPE_LABELS[r.type ?? ""] ?? r.type ?? "—",
        })),
        count,
        _title: "Entités opérateur",
        _rowAction: {
          toolName: "einvoice_config_entity_get",
          idField: "_id",
          argName: "id",
        },
      };
      return {
        content: `${rows.length} entité(s) opérateur`,
        structuredContent: viewerData,
      };
    },
  },

  // ── Get Business Entity ──────────────────────────────

  {
    name: "einvoice_config_entity_get",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/directory-card" } },
    requires: ["getBusinessEntity"],
    description:
      "Get details of a specific business entity managed by your operator. " +
      "Shows registration info, identifiers, and enrollment status.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Business entity ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_config_entity_get] 'id' is required");
      }
      return await ctx.adapter.getBusinessEntity(input.id as string);
    },
  },

  // ── Create Legal Unit ────────────────────────────────

  {
    name: "einvoice_config_entity_create_legal",
    requires: ["createLegalUnit"],
    description:
      "Create a new legal unit (company) under your operator account. " +
      "A legal unit represents a legally registered entity with a unique SIREN. " +
      "After creating the legal unit, create an office (establishment) with a SIRET, " +
      "then enroll it for e-invoicing.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        siren: {
          type: "string",
          description: "SIREN number (9 digits) of the company to register",
        },
        name: {
          type: "string",
          description: "Company name",
        },
        country: {
          type: "string",
          description: "Country code (default: FR)",
        },
        scope: {
          type: "string",
          description: "Entity scope",
          enum: ["PRIVATE_TAX_PAYER", "PUBLIC", "PRIMARY", "SECONDARY"],
        },
      },
      required: ["siren"],
    },
    handler: async (input, ctx) => {
      if (!input.siren) {
        throw new Error(
          "[einvoice_config_entity_create_legal] 'siren' is required",
        );
      }
      return await ctx.adapter.createLegalUnit({
        identifierScheme: "0002",
        identifierValue: input.siren as string,
        name: input.name as string | undefined,
        country: (input.country as string) ?? "FR",
        scope: (input.scope as string) ?? "PRIMARY",
      });
    },
  },

  // ── Create Office ────────────────────────────────────

  {
    name: "einvoice_config_entity_create_office",
    requires: ["createOffice"],
    description:
      "Create a new office (establishment) for an existing legal unit. " +
      "An office represents a physical location with a unique SIRET. " +
      "The legal unit must exist first (use einvoice_config_entity_create_legal). " +
      "After creating, enroll the office with einvoice_config_enroll_fr.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        siret: {
          type: "string",
          description: "SIRET number (14 digits) of the establishment",
        },
        legalUnitId: {
          type: "string",
          description: "Business entity ID of the parent legal unit",
        },
        name: {
          type: "string",
          description: "Office name",
        },
        scope: {
          type: "string",
          description: "Entity scope",
          enum: ["PRIVATE_TAX_PAYER", "PUBLIC", "PRIMARY", "SECONDARY"],
        },
      },
      required: ["siret", "legalUnitId"],
    },
    handler: async (input, ctx) => {
      if (!input.siret || !input.legalUnitId) {
        throw new Error(
          "[einvoice_config_entity_create_office] 'siret' and 'legalUnitId' are required",
        );
      }
      return await ctx.adapter.createOffice({
        identifierScheme: "0009",
        identifierValue: input.siret as string,
        legalBusinessEntityId: input.legalUnitId as string,
        name: input.name as string | undefined,
        scope: (input.scope as string) ?? "PRIMARY",
      });
    },
  },

  // ── Enroll French Entity ─────────────────────────────

  {
    name: "einvoice_config_enroll_fr",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    requires: ["enrollFrench"],
    description:
      "Enroll a French business entity for e-invoicing on the PPF (Portail Public de Facturation). " +
      "REQUIRED before an entity can send or receive invoices. " +
      "If invoice emission returns WRONG_ROUTING, the sender entity needs enrollment. " +
      "Provide the SIRET of the entity to enroll. " +
      "The entity must first exist under your operator (use einvoice_config_entities_list to check).",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        siret: {
          type: "string",
          description: "SIRET (14 digits) of the entity to enroll",
        },
        siren: {
          type: "string",
          description:
            "SIREN (9 digits, first 9 digits of SIRET). If omitted, extracted from SIRET automatically.",
        },
      },
      required: ["siret"],
    },
    handler: async (input, ctx) => {
      if (!input.siret) {
        throw new Error("[einvoice_config_enroll_fr] 'siret' is required");
      }
      const siret = input.siret as string;
      const siren = (input.siren as string) ?? siret.slice(0, 9);
      return await ctx.adapter.enrollFrench({ siret, siren });
    },
  },

  // ── Claim Business Entity ────────────────────────────

  {
    name: "einvoice_config_entity_claim",
    requires: ["claimBusinessEntityByIdentifier"],
    description:
      "Claim management of a business entity by its identifier (SIRET scheme 0009). " +
      "Use this to take over management of an entity that exists in the directory " +
      "but is not yet under your operator account.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        scheme: {
          type: "string",
          description: "Identifier scheme (e.g. '0009' for SIRET)",
        },
        value: {
          type: "string",
          description: "Identifier value (e.g. SIRET number)",
        },
      },
      required: ["scheme", "value"],
    },
    handler: async (input, ctx) => {
      if (!input.scheme || !input.value) {
        throw new Error(
          "[einvoice_config_entity_claim] 'scheme' and 'value' are required",
        );
      }
      return await ctx.adapter.claimBusinessEntityByIdentifier(
        input.scheme as string,
        input.value as string,
        {},
      );
    },
  },

  // ── Delete Business Entity ───────────────────────────

  {
    name: "einvoice_config_entity_delete",
    requires: ["deleteBusinessEntity"],
    description: "Remove a business entity from your operator account. " +
      "This does not delete the entity from the national directory, " +
      "only removes it from your management.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Business entity ID to remove" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_config_entity_delete] 'id' is required");
      }
      return await ctx.adapter.deleteBusinessEntity(input.id as string);
    },
  },

  // ── Register on Network ──────────────────────────────

  {
    name: "einvoice_config_network_register",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    requires: ["registerNetwork"],
    description:
      "Register a business entity identifier on an e-invoicing network (DOMESTIC_FR or PEPPOL_INTERNATIONAL). " +
      "REQUIRED for invoice routing. An entity can be enrolled but still get WRONG_ROUTING " +
      "if its identifier is not registered on the target network. " +
      "Use einvoice_config_entities_list to find the identifier ID, then register it here.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        identifier_id: {
          type: "string",
          description:
            "Business entity identifier ID (UUID, from the identifiers array in entity details)",
        },
        network: {
          type: "string",
          description:
            "Network to register on: DOMESTIC_FR (French PPF) or PEPPOL_INTERNATIONAL",
          enum: ["DOMESTIC_FR", "PEPPOL_INTERNATIONAL"],
        },
      },
      required: ["identifier_id", "network"],
    },
    handler: async (input, ctx) => {
      if (!input.identifier_id || !input.network) {
        throw new Error(
          "[einvoice_config_network_register] 'identifier_id' and 'network' are required",
        );
      }
      return await ctx.adapter.registerNetwork(
        input.identifier_id as string,
        input.network as string,
      );
    },
  },

  // ── Register on Network by Scheme/Value ──────────────

  {
    name: "einvoice_config_network_register_by_id",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    requires: ["registerNetworkByScheme"],
    description:
      "Register an entity on an e-invoicing network using its identifier scheme and value directly. " +
      "Shortcut when you know the SIRET but not the identifier UUID. " +
      "Example: scheme='0009', value='43446637100011', network='DOMESTIC_FR'. " +
      "Use scheme 0009 for SIRET, 0002 for SIREN.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        scheme: {
          type: "string",
          description:
            "Identifier scheme: '0009' for SIRET, '0002' for SIREN, '0225' for SIREN_SIRET",
        },
        value: {
          type: "string",
          description: "Identifier value (e.g. SIRET number)",
        },
        network: {
          type: "string",
          description: "Network: DOMESTIC_FR or PEPPOL_INTERNATIONAL",
          enum: ["DOMESTIC_FR", "PEPPOL_INTERNATIONAL"],
        },
      },
      required: ["scheme", "value", "network"],
    },
    handler: async (input, ctx) => {
      if (!input.scheme || !input.value || !input.network) {
        throw new Error(
          "[einvoice_config_network_register_by_id] 'scheme', 'value', and 'network' are required",
        );
      }
      return await ctx.adapter.registerNetworkByScheme(
        input.scheme as string,
        input.value as string,
        input.network as string,
      );
    },
  },

  // ── Create Identifier ────────────────────────────────

  {
    name: "einvoice_config_identifier_create",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    requires: ["createIdentifier"],
    description: "Add a new identifier to a business entity. " +
      "Identifiers are how entities are found in the directory and how invoices are routed. " +
      "Common schemes: '0009' (SIRET), '0002' (SIREN), '0225' (SIREN_SIRET). " +
      "After creating, register the identifier on a network (DOMESTIC_FR) for invoice routing.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "Business entity ID to add the identifier to",
        },
        scheme: {
          type: "string",
          description:
            "Identifier scheme: '0009' (SIRET), '0002' (SIREN), '0225' (SIREN_SIRET)",
        },
        value: {
          type: "string",
          description: "Identifier value (e.g. SIRET number)",
        },
        type: {
          type: "string",
          description: "Identifier type",
          enum: ["ROUTING_CODE", "SUFFIX"],
        },
      },
      required: ["entity_id", "scheme", "value", "type"],
    },
    handler: async (input, ctx) => {
      if (!input.entity_id || !input.scheme || !input.value || !input.type) {
        throw new Error(
          "[einvoice_config_identifier_create] 'entity_id', 'scheme', 'value', and 'type' are required",
        );
      }
      return await ctx.adapter.createIdentifier(input.entity_id as string, {
        scheme: input.scheme as string,
        value: input.value as string,
        type: input.type as string,
      });
    },
  },

  // ── Create Identifier by Scheme/Value ──────────────────

  {
    name: "einvoice_config_identifier_create_by_scheme",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    requires: ["createIdentifierByScheme"],
    description:
      "Add a new identifier to a business entity, looking up the entity by an existing identifier. " +
      "Shortcut when you know a SIRET/SIREN but not the entity UUID.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        lookup_scheme: {
          type: "string",
          description: "Scheme to find the entity (e.g. '0009' for SIRET)",
        },
        lookup_value: {
          type: "string",
          description: "Value to find the entity (e.g. SIRET number)",
        },
        new_scheme: {
          type: "string",
          description: "Scheme of the new identifier to add",
        },
        new_value: {
          type: "string",
          description: "Value of the new identifier to add",
        },
      },
      required: ["lookup_scheme", "lookup_value", "new_scheme", "new_value"],
    },
    handler: async (input, ctx) => {
      if (
        !input.lookup_scheme || !input.lookup_value || !input.new_scheme ||
        !input.new_value
      ) {
        throw new Error(
          "[einvoice_config_identifier_create_by_scheme] all fields are required",
        );
      }
      return await ctx.adapter.createIdentifierByScheme(
        input.lookup_scheme as string,
        input.lookup_value as string,
        {
          scheme: input.new_scheme as string,
          value: input.new_value as string,
        },
      );
    },
  },

  // ── Delete Identifier ──────────────────────────────────

  {
    name: "einvoice_config_identifier_delete",
    requires: ["deleteIdentifier"],
    description: "Remove an identifier from a business entity. " +
      "WARNING: if the identifier is registered on a network, unregister it first. " +
      "Use the identifier UUID from the entity's identifiers array (einvoice_config_entity_get).",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        identifier_id: {
          type: "string",
          description: "Identifier UUID to delete",
        },
      },
      required: ["identifier_id"],
    },
    handler: async (input, ctx) => {
      if (!input.identifier_id) {
        throw new Error(
          "[einvoice_config_identifier_delete] 'identifier_id' is required",
        );
      }
      return await ctx.adapter.deleteIdentifier(input.identifier_id as string);
    },
  },

  // ── Configure Business Entity ──────────────────────────

  {
    name: "einvoice_config_entity_configure",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    requires: ["configureBusinessEntity"],
    description: "Configure a business entity's settings (e.g. VAT regime). " +
      "Use einvoice_config_entity_get to see current configuration first.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "Business entity ID" },
        vat_regime: {
          type: "string",
          description:
            "VAT regime: REAL_MONTHLY_TAX_REGIME, REAL_QUARTERLY_TAX_REGIME, SIMPLIFIED_TAX_REGIME, or VAT_EXEMPTION_REGIME",
          enum: [
            "REAL_MONTHLY_TAX_REGIME",
            "REAL_QUARTERLY_TAX_REGIME",
            "SIMPLIFIED_TAX_REGIME",
            "VAT_EXEMPTION_REGIME",
          ],
        },
      },
      required: ["entity_id"],
    },
    handler: async (input, ctx) => {
      if (!input.entity_id) {
        throw new Error(
          "[einvoice_config_entity_configure] 'entity_id' is required",
        );
      }
      const config: Record<string, unknown> = {};
      if (input.vat_regime) config.vatRegime = input.vat_regime;
      return await ctx.adapter.configureBusinessEntity(
        input.entity_id as string,
        config,
      );
    },
  },

  // ── Delete Claim ───────────────────────────────────────

  {
    name: "einvoice_config_claim_delete",
    requires: ["deleteClaim"],
    description: "Remove your operator's claim on a business entity. " +
      "The entity remains in the national directory but is no longer managed by your operator. " +
      "WARNING: after removing the claim, you lose management of this entity. " +
      "Use einvoice_config_entity_claim to reclaim it later if needed.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "Business entity ID to unclaim",
        },
      },
      required: ["entity_id"],
    },
    handler: async (input, ctx) => {
      if (!input.entity_id) {
        throw new Error(
          "[einvoice_config_claim_delete] 'entity_id' is required",
        );
      }
      return await ctx.adapter.deleteClaim(input.entity_id as string);
    },
  },

  // ── Unregister from Network ──────────────────────────

  {
    name: "einvoice_config_network_unregister",
    requires: ["unregisterNetwork"],
    description:
      "Unregister an entity from a network. Removes the directory entry. " +
      "After unregistration, the entity will no longer receive invoices on that network. " +
      "Use the directoryId from the entity's networksRegistered array.",
    category: "config",
    inputSchema: {
      type: "object",
      properties: {
        directory_id: {
          type: "string",
          description:
            "Directory entry ID (UUID from the networksRegistered array in entity identifiers)",
        },
      },
      required: ["directory_id"],
    },
    handler: async (input, ctx) => {
      if (!input.directory_id) {
        throw new Error(
          "[einvoice_config_network_unregister] 'directory_id' is required",
        );
      }
      return await ctx.adapter.unregisterNetwork(input.directory_id as string);
    },
  },
];
