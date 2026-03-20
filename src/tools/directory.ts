/**
 * E-Invoice Directory Tools
 *
 * MCP tools for searching the PPF directory and international Peppol directory.
 * PA-agnostic — calls adapter methods.
 *
 * @module lib/einvoice/tools/directory
 */

import type { EInvoiceTool } from "./types.ts";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  LEGAL_UNIT: "Entité juridique",
  OFFICE: "Établissement",
};

export const directoryTools: EInvoiceTool[] = [
  // ── French Directory ────────────────────────────────────

  {
    name: "einvoice_directory_fr_search",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    requires: ["searchDirectoryFr"],
    description:
      "Search the French PPF directory (Portail Public de Facturation). " +
      "Find companies registered for e-invoicing in France. " +
      "Search by SIRET (14 digits), SIREN (9 digits), TVA (FR + 11 digits), or company name. " +
      "Format is auto-detected. " +
      "Returns the company's registered platform (PDP) and routing information.",
    category: "directory",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Search query (required). SIRET, SIREN, VAT number, or company name.",
        },
        offset: { type: "number", description: "Result offset (default 0)" },
        limit: { type: "number", description: "Max results (default 50, max 200)" },
      },
      required: ["q"],
    },
    handler: async (input, ctx) => {
      if (!input.q) {
        throw new Error("[einvoice_directory_fr_search] 'q' query is required");
      }
      // Adapter returns normalized SearchDirectoryFrResult (Lucene wrapping is adapter-internal)
      const { rows, count } = await ctx.adapter.searchDirectoryFr({
        q: input.q as string,
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      });

      return {
        data: rows.map((r) => ({
          _id: r.entityId,
          _detail: {
            name: r.name,
            type: r.type ? (ENTITY_TYPE_LABELS[r.type] ?? r.type) : undefined,
            siren: r.siren,
            siret: r.siret,
            country: r.country,
            directory: r.directory,
            status: r.status,
            createdAt: r.createdAt,
            identifiers: r.identifiers,
          },
          "Nom": r.name ?? "—",
          "Type": r.type ? (ENTITY_TYPE_LABELS[r.type] ?? r.type) : "—",
          "SIRET": r.siret ?? "—",
          "Pays": r.country ?? "—",
        })),
        count,
        _title: "Annuaire français",
      };
    },
  },

  // ── International Directory ─────────────────────────────

  {
    name: "einvoice_directory_int_search",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    requires: ["searchDirectoryInt"],
    description:
      "Search the international Peppol directory. " +
      "Find companies registered on the Peppol network across 40+ countries. " +
      "Search by participant identifier value (e.g. VAT number, GLN, DUNS).",
    category: "directory",
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: "string",
          description:
            "Participant identifier value (required). " +
            "E.g. a VAT number 'FR12345678901' or other identifier.",
        },
        offset: { type: "number", description: "Result offset (default 0)" },
        limit: { type: "number", description: "Max results (default 50, max 200)" },
      },
      required: ["value"],
    },
    handler: async (input, ctx) => {
      if (!input.value) {
        throw new Error("[einvoice_directory_int_search] 'value' is required");
      }
      return await ctx.adapter.searchDirectoryInt({
        value: input.value as string,
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      });
    },
  },

  // ── Check Peppol Participant ────────────────────────────

  {
    name: "einvoice_directory_peppol_check",
    requires: ["checkPeppolParticipant"],
    description:
      "Verify whether a specific Peppol participant exists in the international directory. " +
      "Checks by scheme and identifier value.",
    category: "directory",
    inputSchema: {
      type: "object",
      properties: {
        scheme: {
          type: "string",
          description: "Identifier scheme (e.g. 'iso6523-actorid-upis')",
        },
        value: {
          type: "string",
          description: "Participant identifier value (e.g. '0208:FR12345678901234')",
        },
      },
      required: ["scheme", "value"],
    },
    handler: async (input, ctx) => {
      if (!input.scheme || !input.value) {
        throw new Error(
          "[einvoice_directory_peppol_check] 'scheme' and 'value' are required",
        );
      }
      return await ctx.adapter.checkPeppolParticipant(
        input.scheme as string,
        input.value as string,
      );
    },
  },
];
