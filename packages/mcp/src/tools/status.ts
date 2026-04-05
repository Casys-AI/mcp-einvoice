/**
 * E-Invoice Status Tools
 *
 * MCP tools for managing invoice lifecycle statuses.
 * PA-agnostic — calls adapter methods.
 *
 * @module lib/einvoice/tools/status
 */

import type { EInvoiceTool } from "./types.ts";

export const statusTools: EInvoiceTool[] = [
  // ── Send Status ─────────────────────────────────────────

  {
    name: "einvoice_status_send",
    annotations: { destructiveHint: true },
    requires: ["sendStatus"],
    description: "Send a lifecycle status update for an invoice. " +
      "Uses CDAR lifecycle codes: IN_HAND (204), APPROVED (205), REFUSED (210), " +
      "DISPUTED (207), SUSPENDED (208), PAYMENT_SENT (211), PAYMENT_RECEIVED (212). " +
      "Asynchronous — returns a confirmation.",
    category: "status",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: {
          type: "string",
          description: "Invoice ID to update",
        },
        code: {
          type: "string",
          description: "Status code",
          enum: [
            "IN_HAND",
            "APPROVED",
            "PARTIALLY_APPROVED",
            "DISPUTED",
            "SUSPENDED",
            "COMPLETED",
            "REFUSED",
            "PAYMENT_SENT",
            "PAYMENT_RECEIVED",
          ],
        },
        message: {
          type: "string",
          description: "Optional message/comment for the status change",
        },
        payment: {
          type: "object",
          description:
            "Optional payment details (for PAYMENT_SENT / PAYMENT_RECEIVED)",
        },
      },
      required: ["invoice_id", "code"],
    },
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.invoice_id || !input.code) {
        throw new Error(
          "[einvoice_status_send] 'invoice_id' and 'code' are required",
        );
      }
      const result = await ctx.adapter.sendStatus({
        invoiceId: input.invoice_id as string,
        code: input.code as string,
        message: input.message as string | undefined,
        payment: input.payment as Record<string, unknown> | undefined,
      });
      return {
        content: `Statut ${input.code} envoyé pour la facture ${input.invoice_id}`,
        structuredContent: {
          action: "Envoi statut",
          status: "success",
          title: `${input.code} → facture ${input.invoice_id}`,
          details: result as Record<string, unknown>,
          nextAction: {
            label: "Voir l'historique des statuts",
            toolName: "einvoice_status_history",
            arguments: { invoice_id: input.invoice_id },
          },
        },
      };
    },
  },

  // ── Get Status History ────────────────────────────────────

  {
    name: "einvoice_status_history",
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/status-timeline" } },
    requires: ["getStatusHistory"],
    description:
      "Get the status history for an invoice. Returns all status changes " +
      "in chronological order.",
    category: "status",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "Invoice ID" },
      },
      required: ["invoice_id"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice_id) {
        throw new Error("[einvoice_status_history] 'invoice_id' is required");
      }
      // Adapter returns normalized StatusHistoryResult { entries: StatusEntry[] }
      const result = await ctx.adapter.getStatusHistory(
        input.invoice_id as string,
      );
      return {
        content:
          `${result.entries.length} status entries for invoice ${input.invoice_id}`,
        structuredContent: result,
      };
    },
  },
  // ── seen/notSeen tools removed — see invoice.ts comment and docs/CHANGELOG.md
];
