/**
 * E-Invoice Directory Tools
 *
 * MCP tools for searching the PPF directory and international Peppol directory.
 * PA-agnostic — calls adapter methods.
 *
 * @module lib/einvoice/tools/directory
 */

import type { EInvoiceTool } from "./types.ts";

// ── French entity type labels ──────────────────────────────
const ENTITY_TYPE_LABELS: Record<string, string> = {
  LEGAL_UNIT: "Entité juridique",
  OFFICE: "Établissement",
};

/**
 * Format a raw Iopole directory FR result row into a clean table row.
 *
 * Raw shape (from Iopole /directory/french):
 * ```
 * { businessEntityId, name, type, identifiers: [...], countryIdentifier: { siren, siret },
 *   identifierScheme, identifierValue, scope, ... }
 * ```
 *
 * Output: flat object with French column headers for doclist-viewer.
 */
// deno-lint-ignore no-explicit-any
function formatDirectoryFrRow(row: any): Record<string, unknown> {
  const ci = row.countryIdentifier ?? {};
  const siren = ci.siren ?? row.siren;
  const siret = ci.siret ?? row.siret;
  const country = ci.country ?? row.country ?? "FR";

  return {
    _id: row.businessEntityId,
    _identifiers: row.identifiers,
    "Nom": row.name ?? "—",
    "Type": ENTITY_TYPE_LABELS[row.type] ?? row.type ?? "—",
    "SIREN": siren ?? "—",
    "SIRET": siret ?? "—",
    "Pays": country,
  };
}

/**
 * Auto-detect and wrap a raw directory search query into Lucene syntax.
 *
 * - 14 digits → `siret:"..."`
 * - 9 digits  → `siren:"..."`
 * - FR + 11 digits → `vatNumber:"..."`
 * - 3+ non-digit chars without `:` → `name:"*...*"`
 * - Otherwise pass through as-is (already Lucene syntax)
 */
function autoWrapDirectoryQuery(q: string): string {
  const trimmed = q.trim();
  if (/^\d{14}$/.test(trimmed)) return `siret:"${trimmed}"`;
  if (/^\d{9}$/.test(trimmed)) return `siren:"${trimmed}"`;
  if (/^FR\d{11}$/i.test(trimmed)) return `vatNumber:"${trimmed.toUpperCase()}"`;
  // Not digits, no colon (not already Lucene syntax), at least 3 chars → name wildcard
  if (trimmed.length >= 3 && !/^\d+$/.test(trimmed) && !trimmed.includes(":")) {
    return `name:"*${trimmed}*"`;
  }
  return trimmed;
}

export const directoryTools: EInvoiceTool[] = [
  // ── French Directory ────────────────────────────────────

  {
    name: "einvoice_directory_fr_search",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    description:
      "Search the French PPF directory (Portail Public de Facturation). " +
      "Find companies registered for e-invoicing in France. " +
      "Raw SIRET (14 digits), SIREN (9 digits), TVA (FR + 11 digits), or company names " +
      "are auto-detected and converted to Lucene syntax. You can also pass explicit " +
      "Lucene syntax (e.g. siret:\"43446637100011\") if needed. " +
      "Returns the company's registered platform (PDP) and routing information.",
    category: "directory",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Search query (required). Can be a raw SIRET, SIREN, VAT number, " +
            "or company name — auto-converted to Lucene syntax. " +
            "You can also pass explicit Lucene syntax (e.g. siret:\"43446637100011\").",
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
      const result = await ctx.adapter.searchDirectoryFr({
        q: autoWrapDirectoryQuery(input.q as string),
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      }) as Record<string, unknown>;

      // Lift meta.count to top-level for doclist-viewer
      const meta = result.meta as Record<string, unknown> | undefined;
      if (meta?.count != null && result.count == null) result.count = meta.count;

      // Flatten + format for a chat-friendly table
      const data = result.data as Record<string, unknown>[] | undefined;
      if (Array.isArray(data)) {
        result.data = data.map(formatDirectoryFrRow);
      }
      return result;
    },
  },

  // ── International Directory ─────────────────────────────

  {
    name: "einvoice_directory_int_search",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
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
