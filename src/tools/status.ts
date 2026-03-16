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
    description:
      "Send a lifecycle status update for an invoice. " +
      "Uses Iopole status codes: IN_HAND, APPROVED, PARTIALLY_APPROVED, DISPUTED, " +
      "SUSPENDED, COMPLETED, REFUSED, PAYMENT_SENT, PAYMENT_RECEIVED. " +
      "Asynchronous — returns a GUID to track the request.",
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
          description: "Optional payment details (for PAYMENT_SENT / PAYMENT_RECEIVED)",
        },
      },
      required: ["invoice_id", "code"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice_id || !input.code) {
        throw new Error(
          "[einvoice_status_send] 'invoice_id' and 'code' are required",
        );
      }
      return await ctx.adapter.sendStatus({
        invoiceId: input.invoice_id as string,
        code: input.code as string,
        message: input.message as string | undefined,
        payment: input.payment as Record<string, unknown> | undefined,
      });
    },
  },

  // ── Get Status History ────────────────────────────────────

  {
    name: "einvoice_status_history",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/status-timeline" } },
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
      const raw = await ctx.adapter.getStatusHistory(input.invoice_id as string);
      // Normalize: StatusTimeline expects { entries: StatusEntry[] }.
      // Iopole may return an array directly or a wrapper with data/entries/history.
      if (Array.isArray(raw)) return { entries: raw };
      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj.data)) return { entries: obj.data };
        if (Array.isArray(obj.entries)) return raw;
        if (Array.isArray(obj.history)) return { entries: obj.history };
      }
      return { entries: [] };
    },
  },

  // ── Not Seen ────────────────────────────────────────────

  {
    name: "einvoice_status_not_seen",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    description:
      "Get status updates that have not been marked as seen. " +
      "Useful for polling new incoming status changes on invoices.",
    category: "status",
    inputSchema: {
      type: "object",
      properties: {
        offset: { type: "number", description: "Result offset (default 0)" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
    handler: async (input, ctx) => {
      const result = await ctx.adapter.getUnseenStatuses({
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      });
      return {
        ...(result as Record<string, unknown>),
        _rowAction: {
          toolName: "einvoice_status_history",
          idField: "invoiceId",
          argName: "invoice_id",
        },
      };
    },
  },

  // ── Mark as Seen ────────────────────────────────────────

  {
    name: "einvoice_status_mark_seen",
    description: "Mark a status update as seen/processed.",
    category: "status",
    inputSchema: {
      type: "object",
      properties: {
        status_id: { type: "string", description: "Status ID" },
      },
      required: ["status_id"],
    },
    handler: async (input, ctx) => {
      if (!input.status_id) {
        throw new Error("[einvoice_status_mark_seen] 'status_id' is required");
      }
      return await ctx.adapter.markStatusSeen(input.status_id as string);
    },
  },
];
