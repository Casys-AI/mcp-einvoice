/**
 * Status routes for the E-Invoice REST API.
 *
 * Registers up to 4 status-related routes using @hono/zod-openapi.
 * Each route is only registered if the adapter declares the required capability.
 * These routes must be registered BEFORE invoice routes in app.ts
 * because /api/invoices/{id} would otherwise match first.
 *
 * @module einvoice-rest/src/routes/status
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerStatusRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ─── POST /api/invoices/{id}/status ─────────────────────
  if (adapter.capabilities.has("sendStatus")) {
    const sendStatusRoute = createRoute({
      method: "post",
      path: "/api/invoices/{id}/status",
      tags: ["Status"],
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                code: z.string(),
                message: z.string().optional(),
                payment: z.record(z.unknown()).optional(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: "Status sent" } },
    });

    app.openapi(sendStatusRoute, async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await adapter.sendStatus({ invoiceId: id, ...body });
      return c.json(result, 200);
    });
  }

  // ─── GET /api/invoices/{id}/status-history ───────────────
  if (adapter.capabilities.has("getStatusHistory")) {
    const getStatusHistoryRoute = createRoute({
      method: "get",
      path: "/api/invoices/{id}/status-history",
      tags: ["Status"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Invoice status history" } },
    });

    app.openapi(getStatusHistoryRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.getStatusHistory(id);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/statuses/unseen ────────────────────────────
  if (adapter.capabilities.has("getUnseenStatuses")) {
    const getUnseenStatusesRoute = createRoute({
      method: "get",
      path: "/api/statuses/unseen",
      tags: ["Status"],
      request: {
        query: z.object({
          offset: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        }),
      },
      responses: { 200: { description: "Unseen statuses" } },
    });

    app.openapi(getUnseenStatusesRoute, async (c) => {
      const query = c.req.valid("query");
      const result = await adapter.getUnseenStatuses(query);
      return c.json(result, 200);
    });
  }

  // ─── POST /api/statuses/{id}/mark-seen ──────────────────
  if (adapter.capabilities.has("markStatusSeen")) {
    const markStatusSeenRoute = createRoute({
      method: "post",
      path: "/api/statuses/{id}/mark-seen",
      tags: ["Status"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Status marked as seen" } },
    });

    app.openapi(markStatusSeenRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.markStatusSeen(id);
      return c.json(result, 200);
    });
  }
}
