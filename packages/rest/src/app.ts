/**
 * Hono REST application for e-invoicing.
 *
 * @module einvoice-rest/src/app
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { bearerAuth } from "hono/bearer-auth";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function createApp(
  adapter: EInvoiceAdapter,
  apiKey: string | null,
): OpenAPIHono {
  const app = new OpenAPIHono();

  // ─── Auth middleware ──────────────────────────────────
  if (apiKey) {
    app.use("/api/*", bearerAuth({ token: apiKey }));
  }

  // ─── Health check ─────────────────────────────────────
  app.get("/api/health", (c) => {
    return c.json({ status: "ok", adapter: adapter.name });
  });

  // ─── OpenAPI + Swagger ────────────────────────────────
  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "E-Invoice REST API",
      version: "0.1.0",
      description:
        "PA-agnostic REST API for e-invoicing. Wraps einvoice-core adapters.",
    },
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  return app;
}
