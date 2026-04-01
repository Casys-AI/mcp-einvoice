/**
 * Directory routes for the E-Invoice REST API.
 *
 * Registers up to 3 directory-related routes using @hono/zod-openapi.
 * Each route is only registered if the adapter declares the required capability.
 *
 * @module einvoice-rest/src/routes/directory
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerDirectoryRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ─── GET /api/directory/fr ───────────────────────────────
  if (adapter.capabilities.has("searchDirectoryFr")) {
    const searchFrRoute = createRoute({
      method: "get",
      path: "/api/directory/fr",
      tags: ["Directory"],
      request: {
        query: z.object({
          q: z.string(),
          offset: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        }),
      },
      responses: { 200: { description: "French directory search results" } },
    });

    app.openapi(searchFrRoute, async (c) => {
      const query = c.req.valid("query");
      const result = await adapter.searchDirectoryFr(query);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/directory/int ──────────────────────────────
  if (adapter.capabilities.has("searchDirectoryInt")) {
    const searchIntRoute = createRoute({
      method: "get",
      path: "/api/directory/int",
      tags: ["Directory"],
      request: {
        query: z.object({
          value: z.string(),
          offset: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        }),
      },
      responses: { 200: { description: "International directory search results" } },
    });

    app.openapi(searchIntRoute, async (c) => {
      const query = c.req.valid("query");
      const result = await adapter.searchDirectoryInt(query);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/directory/peppol/check ────────────────────
  if (adapter.capabilities.has("checkPeppolParticipant")) {
    const checkPeppolRoute = createRoute({
      method: "get",
      path: "/api/directory/peppol/check",
      tags: ["Directory"],
      request: {
        query: z.object({
          scheme: z.string(),
          value: z.string(),
        }),
      },
      responses: { 200: { description: "Peppol participant check result" } },
    });

    app.openapi(checkPeppolRoute, async (c) => {
      const { scheme, value } = c.req.valid("query");
      const result = await adapter.checkPeppolParticipant(scheme, value);
      return c.json(result, 200);
    });
  }
}
