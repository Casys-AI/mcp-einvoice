/**
 * E-Invoice Webhook Tools
 *
 * MCP tools for managing webhooks that receive real-time notifications
 * about invoice and status changes.
 * PA-agnostic — calls adapter methods.
 *
 * @module lib/einvoice/tools/webhook
 */

import type { EInvoiceTool } from "./types.ts";

export const webhookTools: EInvoiceTool[] = [
  // ── List ────────────────────────────────────────────────

  {
    name: "einvoice_webhook_list",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    description: "List all configured webhooks for your account.",
    category: "webhook",
    requires: ["listWebhooks"],
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      return await ctx.adapter.listWebhooks();
    },
  },

  // ── Get ─────────────────────────────────────────────────

  {
    name: "einvoice_webhook_get",
    description: "Get a single webhook configuration by its ID.",
    category: "webhook",
    requires: ["getWebhook"],
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Webhook ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_get] 'id' is required");
      }
      return await ctx.adapter.getWebhook(input.id as string);
    },
  },

  // ── Create ──────────────────────────────────────────────

  {
    name: "einvoice_webhook_create",
    requires: ["createWebhook"],
    description:
      "Create a new webhook to receive real-time notifications. " +
      "Specify the target URL and which events to subscribe to " +
      "(e.g. invoice.received, status.changed).",
    category: "webhook",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Target URL that will receive webhook POST requests",
        },
        events: {
          type: "array",
          items: { type: "string" },
          description:
            "List of event types to subscribe to (e.g. invoice.received, invoice.sent, status.changed)",
        },
        name: {
          type: "string",
          description: "Human-readable name for this webhook",
        },
        active: {
          type: "boolean",
          description: "Whether the webhook is active (default true)",
        },
      },
      required: ["url", "events"],
    },
    handler: async (input, ctx) => {
      if (!input.url || !input.events) {
        throw new Error(
          "[einvoice_webhook_create] 'url' and 'events' are required",
        );
      }
      return await ctx.adapter.createWebhook({
        url: input.url as string,
        events: input.events as string[],
        name: input.name as string | undefined,
        active: input.active as boolean | undefined,
      });
    },
  },

  // ── Update ──────────────────────────────────────────────

  {
    name: "einvoice_webhook_update",
    description: "Update an existing webhook configuration.",
    category: "webhook",
    requires: ["updateWebhook"],
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Webhook ID" },
        url: { type: "string", description: "Updated target URL" },
        events: {
          type: "array",
          items: { type: "string" },
          description: "Updated event types list",
        },
        name: { type: "string", description: "Updated name" },
        active: { type: "boolean", description: "Enable/disable webhook" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_update] 'id' is required");
      }
      return await ctx.adapter.updateWebhook(input.id as string, {
        url: input.url as string | undefined,
        events: input.events as string[] | undefined,
        name: input.name as string | undefined,
        active: input.active as boolean | undefined,
      });
    },
  },

  // ── Delete ──────────────────────────────────────────────

  {
    name: "einvoice_webhook_delete",
    description: "Delete a webhook configuration.",
    category: "webhook",
    requires: ["deleteWebhook"],
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Webhook ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_delete] 'id' is required");
      }
      return await ctx.adapter.deleteWebhook(input.id as string);
    },
  },
];
