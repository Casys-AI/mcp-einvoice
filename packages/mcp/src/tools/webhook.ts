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
    annotations: { readOnlyHint: true },
    description: "List all configured webhooks for your account.",
    category: "webhook",
    requires: ["listWebhooks"],
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      const webhooks = await ctx.adapter.listWebhooks();
      const data = webhooks.map((w) => ({
        _id: w.id,
        "Nom": w.name ?? "—",
        "URL": w.url ?? "—",
        "Actif": w.active !== false ? "Oui" : "Non",
        "Événements": Array.isArray(w.events)
          ? w.events.join(", ")
          : "—",
      }));
      return {
        content: `${data.length} webhook(s) configuré(s)`,
        structuredContent: {
          data,
          count: data.length,
          _title: "Webhooks",
        },
      };
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
    annotations: { readOnlyHint: true },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_get] 'id' is required");
      }
      const webhook = await ctx.adapter.getWebhook(input.id as string);
      const name = webhook.name ?? webhook.id ?? input.id;
      return {
        content: `Webhook : ${name}`,
        structuredContent: webhook,
      };
    },
  },

  // ── Create ──────────────────────────────────────────────

  {
    name: "einvoice_webhook_create",
    requires: ["createWebhook"],
    description: "Create a new webhook to receive real-time notifications. " +
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
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.url || !input.events) {
        throw new Error(
          "[einvoice_webhook_create] 'url' and 'events' are required",
        );
      }
      const result = await ctx.adapter.createWebhook({
        url: input.url as string,
        events: input.events as string[],
        name: input.name as string | undefined,
        active: input.active as boolean | undefined,
      });
      return {
        content: `Webhook créé : ${input.name ?? input.url}`,
        structuredContent: {
          action: "Création webhook",
          status: "success",
          title: `Webhook créé : ${input.name ?? input.url}`,
          details: { ...result },
        },
      };
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
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_update] 'id' is required");
      }
      const result = await ctx.adapter.updateWebhook(input.id as string, {
        url: input.url as string | undefined,
        events: input.events as string[] | undefined,
        name: input.name as string | undefined,
        active: input.active as boolean | undefined,
      });
      return {
        content: `Webhook ${input.id} mis à jour`,
        structuredContent: {
          action: "Mise à jour webhook",
          status: "success",
          title: `Webhook ${input.id} mis à jour`,
          details: { ...result },
        },
      };
    },
  },

  // ── Delete ──────────────────────────────────────────────

  {
    name: "einvoice_webhook_delete",
    annotations: { destructiveHint: true },
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
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_delete] 'id' is required");
      }
      const result = await ctx.adapter.deleteWebhook(input.id as string);
      return {
        content: `Webhook ${input.id} supprimé`,
        structuredContent: {
          action: "Suppression webhook",
          status: "success",
          title: `Webhook ${input.id} supprimé`,
          details: { ...result },
        },
      };
    },
  },
];
