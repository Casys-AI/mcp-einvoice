/**
 * Reporting routes for the E-Invoice REST API.
 *
 * Registers 2 reporting-related routes using @hono/zod-openapi.
 *
 * @module einvoice-rest/src/routes/reporting
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerReportingRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ─── POST /api/reporting/invoice-transaction ─────────────
  const reportInvoiceTransactionRoute = createRoute({
    method: "post",
    path: "/api/reporting/invoice-transaction",
    tags: ["Reporting"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Invoice transaction reported" } },
  });

  app.openapi(reportInvoiceTransactionRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.reportInvoiceTransaction(body);
    return c.json(result, 200);
  });

  // ─── POST /api/reporting/entities/{entityId}/transaction ──
  const reportTransactionRoute = createRoute({
    method: "post",
    path: "/api/reporting/entities/{entityId}/transaction",
    tags: ["Reporting"],
    request: {
      params: z.object({ entityId: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Transaction reported" } },
  });

  app.openapi(reportTransactionRoute, async (c) => {
    const { entityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.reportTransaction(entityId, body);
    return c.json(result, 200);
  });
}
