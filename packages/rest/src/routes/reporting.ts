/**
 * Reporting routes for the E-Invoice REST API.
 *
 * Registers up to 2 reporting-related routes using @hono/zod-openapi.
 * Each route is only registered if the adapter declares the required capability.
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
  // ─── POST /api/reporting/scheme/{scheme}/value/{value}/invoice-transaction ──
  if (adapter.capabilities.has("reportInvoiceTransaction")) {
    const reportInvoiceTransactionRoute = createRoute({
      method: "post",
      path: "/api/reporting/scheme/{scheme}/value/{value}/invoice-transaction",
      tags: ["Reporting"],
      request: {
        params: z.object({ scheme: z.string(), value: z.string() }),
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
      const { scheme, value } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await adapter.reportInvoiceTransaction(scheme, value, body);
      return c.json(result, 200);
    });
  }

  // ─── POST /api/reporting/scheme/{scheme}/value/{value}/transaction ──
  if (adapter.capabilities.has("reportTransaction")) {
    const reportTransactionRoute = createRoute({
      method: "post",
      path: "/api/reporting/scheme/{scheme}/value/{value}/transaction",
      tags: ["Reporting"],
      request: {
        params: z.object({ scheme: z.string(), value: z.string() }),
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
      const { scheme, value } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await adapter.reportTransaction(scheme, value, body);
      return c.json(result, 200);
    });
  }
}
