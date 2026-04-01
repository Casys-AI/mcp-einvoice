/**
 * Webhook routes for the E-Invoice REST API.
 *
 * Registers 5 webhook-related routes using @hono/zod-openapi.
 * Static paths (GET /api/webhooks, POST /api/webhooks) are registered
 * before parametric paths (GET/PUT/DELETE /api/webhooks/{id}).
 *
 * @module einvoice-rest/src/routes/webhooks
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerWebhookRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ─── GET /api/webhooks ───────────────────────────────────
  const listWebhooksRoute = createRoute({
    method: "get",
    path: "/api/webhooks",
    tags: ["Webhooks"],
    responses: { 200: { description: "List of webhooks" } },
  });

  app.openapi(listWebhooksRoute, async (c) => {
    const result = await adapter.listWebhooks();
    return c.json(result, 200);
  });

  // ─── POST /api/webhooks ──────────────────────────────────
  const createWebhookRoute = createRoute({
    method: "post",
    path: "/api/webhooks",
    tags: ["Webhooks"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              url: z.string(),
              events: z.array(z.string()),
              name: z.string().optional(),
              active: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Webhook created" } },
  });

  app.openapi(createWebhookRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.createWebhook(body);
    return c.json(result, 200);
  });

  // ─── GET /api/webhooks/{id} ──────────────────────────────
  const getWebhookRoute = createRoute({
    method: "get",
    path: "/api/webhooks/{id}",
    tags: ["Webhooks"],
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: { 200: { description: "Webhook detail" } },
  });

  app.openapi(getWebhookRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getWebhook(id);
    return c.json(result, 200);
  });

  // ─── PUT /api/webhooks/{id} ──────────────────────────────
  const updateWebhookRoute = createRoute({
    method: "put",
    path: "/api/webhooks/{id}",
    tags: ["Webhooks"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              url: z.string().optional(),
              events: z.array(z.string()).optional(),
              name: z.string().optional(),
              active: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Webhook updated" } },
  });

  app.openapi(updateWebhookRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.updateWebhook(id, body);
    return c.json(result, 200);
  });

  // ─── DELETE /api/webhooks/{id} ───────────────────────────
  const deleteWebhookRoute = createRoute({
    method: "delete",
    path: "/api/webhooks/{id}",
    tags: ["Webhooks"],
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: { 200: { description: "Webhook deleted" } },
  });

  app.openapi(deleteWebhookRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.deleteWebhook(id);
    return c.json(result, 200);
  });
}
