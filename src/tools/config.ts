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

export const configTools: EInvoiceTool[] = [
  // ── Customer ID ──────────────────────────────────────

  {
    name: "einvoice_config_customer_id",
    description:
      "Get the current operator customer ID. " +
      "This is your unique operator identifier on the e-invoicing platform.",
    category: "config" as EInvoiceTool["category"],
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
    description:
      "List all business entities managed by your operator account. " +
      "Shows which companies/offices are enrolled for e-invoicing under your management. " +
      "If this list is empty, you need to enroll entities before sending invoices.",
    category: "config" as EInvoiceTool["category"],
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      const result = await ctx.adapter.listBusinessEntities() as Record<string, unknown>;

      // Format for doclist-viewer
      const data = result.data as Record<string, unknown>[] | undefined;
      if (Array.isArray(data)) {
        // deno-lint-ignore no-explicit-any
        result.data = data.map((row: any) => {
          const ci = row.countryIdentifier ?? {};
          return {
            _id: row.businessEntityId,
            "Nom": row.name ?? "—",
            "Type": row.type === "LEGAL_UNIT" ? "Unité légale" : row.type === "OFFICE" ? "Établissement" : row.type ?? "—",
            "SIREN": ci.siren ?? row.siren ?? "—",
            "SIRET": ci.siret ?? row.siret ?? "—",
            "Scope": row.scope ?? "—",
            "Pays": ci.country ?? row.country ?? "FR",
          };
        });
      }

      return {
        ...result,
        _title: "Entités opérateur",
        _rowAction: {
          toolName: "einvoice_config_entity_get",
          idField: "_id",
          argName: "id",
        },
      };
    },
  },

  // ── Get Business Entity ──────────────────────────────

  {
    name: "einvoice_config_entity_get",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/directory-card" } },
    description:
      "Get details of a specific business entity managed by your operator. " +
      "Shows registration info, identifiers, and enrollment status.",
    category: "config" as EInvoiceTool["category"],
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
    description:
      "Create a new legal unit (company) under your operator account. " +
      "A legal unit represents a legally registered entity with a unique SIREN. " +
      "After creating the legal unit, create an office (establishment) with a SIRET, " +
      "then enroll it for e-invoicing.",
    category: "config" as EInvoiceTool["category"],
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
      },
      required: ["siren"],
    },
    handler: async (input, ctx) => {
      if (!input.siren) {
        throw new Error("[einvoice_config_entity_create_legal] 'siren' is required");
      }
      return await ctx.adapter.createLegalUnit({
        siren: input.siren as string,
        name: input.name as string | undefined,
        country: (input.country as string) ?? "FR",
      });
    },
  },

  // ── Create Office ────────────────────────────────────

  {
    name: "einvoice_config_entity_create_office",
    description:
      "Create a new office (establishment) for an existing legal unit. " +
      "An office represents a physical location with a unique SIRET. " +
      "The legal unit must exist first (use einvoice_config_entity_create_legal). " +
      "After creating, enroll the office with einvoice_config_enroll_fr.",
    category: "config" as EInvoiceTool["category"],
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
      },
      required: ["siret", "legalUnitId"],
    },
    handler: async (input, ctx) => {
      if (!input.siret || !input.legalUnitId) {
        throw new Error("[einvoice_config_entity_create_office] 'siret' and 'legalUnitId' are required");
      }
      return await ctx.adapter.createOffice({
        siret: input.siret as string,
        legalUnitId: input.legalUnitId as string,
        name: input.name as string | undefined,
      });
    },
  },

  // ── Enroll French Entity ─────────────────────────────

  {
    name: "einvoice_config_enroll_fr",
    description:
      "Enroll a French business entity for e-invoicing on the PPF (Portail Public de Facturation). " +
      "REQUIRED before an entity can send or receive invoices. " +
      "If invoice emission returns WRONG_ROUTING, the sender entity needs enrollment. " +
      "Provide the SIRET of the entity to enroll. " +
      "The entity must first exist under your operator (use einvoice_config_entities_list to check).",
    category: "config" as EInvoiceTool["category"],
    inputSchema: {
      type: "object",
      properties: {
        siret: {
          type: "string",
          description: "SIRET (14 digits) of the entity to enroll for e-invoicing",
        },
      },
      required: ["siret"],
    },
    handler: async (input, ctx) => {
      if (!input.siret) {
        throw new Error("[einvoice_config_enroll_fr] 'siret' is required");
      }
      return await ctx.adapter.enrollFrench({
        siret: input.siret as string,
      });
    },
  },

  // ── Claim Business Entity ────────────────────────────

  {
    name: "einvoice_config_entity_claim",
    description:
      "Claim management of a business entity by its identifier (SIRET scheme 0009). " +
      "Use this to take over management of an entity that exists in the directory " +
      "but is not yet under your operator account.",
    category: "config" as EInvoiceTool["category"],
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
        throw new Error("[einvoice_config_entity_claim] 'scheme' and 'value' are required");
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
    description:
      "Remove a business entity from your operator account. " +
      "This does not delete the entity from the national directory, " +
      "only removes it from your management.",
    category: "config" as EInvoiceTool["category"],
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
];
