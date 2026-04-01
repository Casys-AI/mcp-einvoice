/**
 * Invoice routes for the E-Invoice REST API.
 *
 * Registers up to 13 invoice-related routes using @hono/zod-openapi.
 * Each route is only registered if the adapter declares the required capability.
 * Order matters: static paths (unseen, emit, generate/*) must be
 * registered BEFORE the /{id} param route to avoid accidental matches.
 *
 * @module einvoice-rest/src/routes/invoices
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerInvoiceRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ─── POST /api/invoices/emit ─────────────────────────────
  if (adapter.capabilities.has("emitInvoice")) {
    const emitRoute = createRoute({
      method: "post",
      path: "/api/invoices/emit",
      tags: ["Invoices"],
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                file_base64: z.string(),
                filename: z.string(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: "Invoice emitted" } },
    });

    app.openapi(emitRoute, async (c) => {
      const body = c.req.valid("json");
      const binaryString = atob(body.file_base64);
      const file = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        file[i] = binaryString.charCodeAt(i);
      }
      const result = await adapter.emitInvoice({ file, filename: body.filename });
      return c.json(result, 200);
    });
  }

  // ─── GET /api/invoices/unseen ────────────────────────────
  if (adapter.capabilities.has("getUnseenInvoices")) {
    const unseenRoute = createRoute({
      method: "get",
      path: "/api/invoices/unseen",
      tags: ["Invoices"],
      request: {
        query: z.object({
          offset: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        }),
      },
      responses: { 200: { description: "Unseen invoices" } },
    });

    app.openapi(unseenRoute, async (c) => {
      const query = c.req.valid("query");
      const result = await adapter.getUnseenInvoices(query);
      return c.json(result, 200);
    });
  }

  // ─── POST /api/invoices/generate/cii ────────────────────
  if (adapter.capabilities.has("generateCII")) {
    const generateCiiRoute = createRoute({
      method: "post",
      path: "/api/invoices/generate/cii",
      tags: ["Invoices"],
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                invoice: z.record(z.unknown()),
                flavor: z.string(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: "CII XML output" } },
    });

    app.openapi(generateCiiRoute, async (c) => {
      const body = c.req.valid("json");
      const xml = await adapter.generateCII({
        invoice: body.invoice,
        flavor: body.flavor,
      });
      return c.text(xml, 200);
    });
  }

  // ─── POST /api/invoices/generate/ubl ────────────────────
  if (adapter.capabilities.has("generateUBL")) {
    const generateUblRoute = createRoute({
      method: "post",
      path: "/api/invoices/generate/ubl",
      tags: ["Invoices"],
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                invoice: z.record(z.unknown()),
                flavor: z.string(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: "UBL XML output" } },
    });

    app.openapi(generateUblRoute, async (c) => {
      const body = c.req.valid("json");
      const xml = await adapter.generateUBL({
        invoice: body.invoice,
        flavor: body.flavor,
      });
      return c.text(xml, 200);
    });
  }

  // ─── POST /api/invoices/generate/facturx ────────────────
  if (adapter.capabilities.has("generateFacturX")) {
    const generateFacturxRoute = createRoute({
      method: "post",
      path: "/api/invoices/generate/facturx",
      tags: ["Invoices"],
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                invoice: z.record(z.unknown()),
                flavor: z.string(),
                language: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: "Factur-X PDF binary" } },
    });

    app.openapi(generateFacturxRoute, async (c) => {
      const body = c.req.valid("json");
      const result = await adapter.generateFacturX({
        invoice: body.invoice,
        flavor: body.flavor,
        language: body.language,
      });
      return new Response(result.data.buffer as ArrayBuffer, {
        headers: { "Content-Type": result.contentType },
      });
    });
  }

  // ─── GET /api/invoices ───────────────────────────────────
  if (adapter.capabilities.has("searchInvoices")) {
    const searchRoute = createRoute({
      method: "get",
      path: "/api/invoices",
      tags: ["Invoices"],
      request: {
        query: z.object({
          q: z.string().optional(),
          direction: z.enum(["sent", "received"]).optional(),
          status: z.string().optional(),
          offset: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        }),
      },
      responses: { 200: { description: "Invoice search results" } },
    });

    app.openapi(searchRoute, async (c) => {
      const query = c.req.valid("query");
      const result = await adapter.searchInvoices(query);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/invoices/{id} ──────────────────────────────
  if (adapter.capabilities.has("getInvoice")) {
    const getInvoiceRoute = createRoute({
      method: "get",
      path: "/api/invoices/{id}",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Invoice detail" } },
    });

    app.openapi(getInvoiceRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.getInvoice(id);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/invoices/{id}/download ────────────────────
  if (adapter.capabilities.has("downloadInvoice")) {
    const downloadInvoiceRoute = createRoute({
      method: "get",
      path: "/api/invoices/{id}/download",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Invoice binary file" } },
    });

    app.openapi(downloadInvoiceRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.downloadInvoice(id);
      return new Response(result.data.buffer as ArrayBuffer, {
        headers: { "Content-Type": result.contentType },
      });
    });
  }

  // ─── GET /api/invoices/{id}/readable ────────────────────
  if (adapter.capabilities.has("downloadReadable")) {
    const downloadReadableRoute = createRoute({
      method: "get",
      path: "/api/invoices/{id}/readable",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Readable PDF binary" } },
    });

    app.openapi(downloadReadableRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.downloadReadable(id);
      return new Response(result.data.buffer as ArrayBuffer, {
        headers: { "Content-Type": result.contentType },
      });
    });
  }

  // ─── GET /api/invoices/{id}/files ───────────────────────
  if (adapter.capabilities.has("getInvoiceFiles")) {
    const getInvoiceFilesRoute = createRoute({
      method: "get",
      path: "/api/invoices/{id}/files",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Invoice files list" } },
    });

    app.openapi(getInvoiceFilesRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.getInvoiceFiles(id);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/invoices/{id}/attachments ─────────────────
  if (adapter.capabilities.has("getAttachments")) {
    const getAttachmentsRoute = createRoute({
      method: "get",
      path: "/api/invoices/{id}/attachments",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Invoice attachments" } },
    });

    app.openapi(getAttachmentsRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.getAttachments(id);
      return c.json(result, 200);
    });
  }

  // ─── GET /api/files/{fileId}/download ───────────────────
  if (adapter.capabilities.has("downloadFile")) {
    const downloadFileRoute = createRoute({
      method: "get",
      path: "/api/files/{fileId}/download",
      tags: ["Invoices"],
      request: {
        params: z.object({ fileId: z.string() }),
      },
      responses: { 200: { description: "File binary content" } },
    });

    app.openapi(downloadFileRoute, async (c) => {
      const { fileId } = c.req.valid("param");
      const result = await adapter.downloadFile(fileId);
      return new Response(result.data.buffer as ArrayBuffer, {
        headers: { "Content-Type": result.contentType },
      });
    });
  }

  // ─── POST /api/invoices/{id}/mark-seen ──────────────────
  if (adapter.capabilities.has("markInvoiceSeen")) {
    const markSeenRoute = createRoute({
      method: "post",
      path: "/api/invoices/{id}/mark-seen",
      tags: ["Invoices"],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: { 200: { description: "Invoice marked as seen" } },
    });

    app.openapi(markSeenRoute, async (c) => {
      const { id } = c.req.valid("param");
      const result = await adapter.markInvoiceSeen(id);
      return c.json(result, 200);
    });
  }
}
