/**
 * E-Invoice Invoice Tools
 *
 * MCP tools for e-invoicing: emit, search, download, generate formats.
 * PA-agnostic — calls adapter methods, not API endpoints.
 *
 * @module lib/einvoice/tools/invoice
 */

import type { EInvoiceTool } from "./types.ts";
import { storeGenerated, getGenerated } from "../generated-store.ts";

/**
 * Normalize invoice data before sending to Iopole generate API.
 * Adds missing fields that the EN16931 schematron requires
 * but that LLMs often forget (postalAddress, electronicAddress, etc.)
 */
// deno-lint-ignore no-explicit-any
function normalizeInvoiceForGenerate(inv: any): Record<string, unknown> {
  const normalized = { ...inv };

  // Ensure seller/buyer have postalAddress (BR-08, BR-10)
  for (const party of ["seller", "buyer"]) {
    if (normalized[party] && !normalized[party].postalAddress) {
      normalized[party] = {
        ...normalized[party],
        postalAddress: { country: normalized[party].country ?? "FR" },
      };
    }
  }

  // Auto-generate electronicAddress from SIRET when absent.
  // Uses scheme 0225 (SIRET-based routing) — standard for French PPF/PDP.
  // NOTE: Explicit heuristic. If the entity uses a different routing scheme,
  // the caller should provide electronicAddress directly to override this default.
  for (const party of ["seller", "buyer"]) {
    const p = normalized[party];
    if (p && !p.electronicAddress && p.siren && p.siret) {
      normalized[party] = {
        ...p,
        electronicAddress: `0225:${p.siren}_${p.siret}`,
        identifiers: p.identifiers ?? [
          { type: "ELECTRONIC_ADDRESS", value: `${p.siren}_${p.siret}`, scheme: "0225" },
          { type: "PARTY_LEGAL_IDENTIFIER", value: p.siren, scheme: "0002" },
        ],
      };
    }
  }

  // Ensure paymentTerms is a string, not an array
  if (Array.isArray(normalized.paymentTerms)) {
    normalized.paymentTerms = normalized.paymentTerms
      .map((t: Record<string, unknown>) => t.description ?? t)
      .join("; ");
  }

  return normalized;
}

/**
 * Map Iopole businessData-shaped input to invoice-viewer preview format.
 * Used by generate tools to show the invoice before sending.
 */
// deno-lint-ignore no-explicit-any
function mapToViewerPreview(inv: any): Record<string, unknown> {
  const lines = (inv.lines ?? []).map((l: Record<string, unknown>) => {
    // deno-lint-ignore no-explicit-any
    const line = l as any;
    return {
      description: line.item?.name ?? line.description,
      quantity: line.billedQuantity?.quantity ?? line.quantity,
      unit_price: line.price?.netAmount?.amount ?? line.unit_price,
      tax_rate: line.taxDetail?.percent ?? line.tax_rate,
      amount: line.totalAmount?.amount ?? line.amount,
    };
  });
  return {
    id: "(aperçu)",
    invoice_number: inv.invoiceId,
    issue_date: inv.invoiceDate,
    due_date: inv.invoiceDueDate,
    invoice_type: inv.detailedType?.value ?? inv.type,
    sender_name: inv.seller?.name,
    sender_id: inv.seller?.siret ?? inv.seller?.siren,
    sender_vat: inv.seller?.vatNumber,
    receiver_name: inv.buyer?.name,
    receiver_id: inv.buyer?.siret ?? inv.buyer?.siren,
    receiver_vat: inv.buyer?.vatNumber,
    currency: inv.monetary?.invoiceCurrency ?? "EUR",
    total_ht: inv.monetary?.taxBasisTotalAmount?.amount ?? inv.monetary?.lineTotalAmount?.amount,
    total_tax: inv.monetary?.taxTotalAmount?.amount,
    total_ttc: inv.monetary?.invoiceAmount?.amount ?? inv.monetary?.payableAmount?.amount,
    items: lines,
    status: "aperçu",
    direction: "sent",
  };
}

export const invoiceTools: EInvoiceTool[] = [
  // ── Emit ────────────────────────────────────────────────

  {
    name: "einvoice_invoice_emit",
    description:
      "Emit (send) an invoice via the e-invoicing platform. " +
      "Provide EITHER a generated_id (from a generate preview) OR file_base64 + filename. " +
      "Asynchronous — returns a GUID to track the request.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        generated_id: {
          type: "string",
          description:
            "ID returned by a generate tool (einvoice_invoice_generate_cii/ubl/facturx). " +
            "The server retrieves the previously generated file. Mutually exclusive with file_base64.",
        },
        file_base64: {
          type: "string",
          description:
            "Base64-encoded invoice file content (PDF or XML only). " +
            "Use this for direct upload. Mutually exclusive with generated_id.",
        },
        filename: {
          type: "string",
          description:
            "Filename with extension. Must end in .pdf or .xml. Required with file_base64.",
        },
      },
    },
    handler: async (input, ctx) => {
      // Path 1: retrieve from temp store
      if (input.generated_id) {
        const stored = getGenerated(input.generated_id as string);
        if (!stored) {
          throw new Error(
            "[einvoice_invoice_emit] Generated file expired or not found. " +
            "Regenerate the invoice first.",
          );
        }
        return await ctx.adapter.emitInvoice(stored);
      }

      // Path 2: direct base64 upload (existing behavior)
      if (!input.file_base64 || !input.filename) {
        throw new Error(
          "[einvoice_invoice_emit] Provide either 'generated_id' or both 'file_base64' and 'filename'",
        );
      }
      const filename = input.filename as string;
      const lower = filename.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".xml")) {
        throw new Error("[einvoice_invoice_emit] filename must end in .pdf or .xml");
      }
      // Decode base64 to Uint8Array
      const binaryString = atob(input.file_base64 as string);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return await ctx.adapter.emitInvoice({ file: bytes, filename });
    },
  },

  // ── Search ──────────────────────────────────────────────

  {
    name: "einvoice_invoice_search",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    description:
      "Search invoices using a query string. Returns paginated results. " +
      "The query uses Lucene-like syntax (e.g. 'status:accepted AND direction:received'). " +
      "Use expand to include additional data in results.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Search query (Lucene-like syntax). " +
            "Examples: 'status:accepted', 'direction:received', 'senderName:Acme'.",
        },
        expand: {
          type: "string",
          description: "Comma-separated list of fields to expand in results (default: 'businessData' — needed for formatted output)",
        },
        offset: { type: "number", description: "Result offset (default 0)" },
        limit: { type: "number", description: "Max results to return (default 50, max 200)" },
      },
    },
    handler: async (input, ctx) => {
      // Sanitize q: undefined, empty, whitespace-only, or wildcard-only → omit (list all)
      let q = input.q as string | undefined;
      if (q != null && /^\s*\*?\s*$/.test(q)) q = undefined;

      const result = await ctx.adapter.searchInvoices({
        q,
        expand: (input.expand as string | undefined) ?? "businessData",
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      }) as Record<string, unknown>;

      // Lift meta.count to top-level for doclist-viewer
      const meta = result.meta as Record<string, unknown> | undefined;
      if (meta?.count != null && result.count == null) result.count = meta.count;

      // Flatten + format for a chat-friendly table
      const data = result.data as Record<string, unknown>[] | undefined;
      if (Array.isArray(data)) {
        // deno-lint-ignore no-explicit-any
        result.data = data.map((row: any) => {
          const m = row.metadata ?? {};
          const bd = row.businessData ?? {};
          const dateRaw = bd.invoiceDate ?? m.createDate?.split("T")[0];
          const amount = bd.monetary?.invoiceAmount?.amount;
          const currency = bd.monetary?.invoiceCurrency ?? "EUR";
          return {
            _id: m.invoiceId,
            "N°": bd.invoiceId ?? "—",
            "Statut": m.state,
            "Direction": m.direction === "INBOUND" ? "Reçue" : m.direction === "OUTBOUND" ? "Émise" : m.direction,
            "Émetteur": bd.seller?.name ?? "—",
            "Destinataire": bd.buyer?.name ?? "—",
            "Date": dateRaw ? new Date(dateRaw).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—",
            "Montant": amount != null ? `${amount.toLocaleString("fr-FR")} ${currency}` : "—",
          };
        });
      }
      return {
        ...result,
        _rowAction: {
          toolName: "einvoice_invoice_get",
          idField: "_id",
          argName: "id",
        },
      };
    },
  },

  // ── Get by ID ───────────────────────────────────────────

  {
    name: "einvoice_invoice_get",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    description:
      "Get a single invoice by its ID. Returns full invoice details including " +
      "status history, sender/receiver info, and line items.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_get] 'id' is required");
      }
      const raw = await ctx.adapter.getInvoice(input.id as string);
      // Map Iopole structure to invoice-viewer format
      // deno-lint-ignore no-explicit-any
      const inv = (Array.isArray(raw) ? raw[0] : raw) as any;
      if (!inv?.businessData) {
        // No businessData yet (e.g. freshly emitted, schematron-rejected, or not parsed).
        // Still return structured metadata so the viewer can show something useful.
        return {
          id: inv?.invoiceId,
          status: inv?.state ?? inv?.status ?? "UNKNOWN",
          direction: (() => {
            const d = inv?.way ?? inv?.metadata?.direction;
            if (!d) return undefined;
            if (d === "RECEIVED" || d === "INBOUND") return "received";
            if (d === "SENT" || d === "EMITTED" || d === "OUTBOUND") return "sent";
            return d.toLowerCase();
          })(),
          format: inv?.originalFormat,
          network: inv?.originalNetwork,
          issue_date: inv?.date,
        };
      }
      const bd = inv.businessData;
      const lines = (bd.lines ?? []).map((l: Record<string, unknown>) => {
        // deno-lint-ignore no-explicit-any
        const line = l as any;
        return {
          description: line.item?.name,
          quantity: line.billedQuantity?.quantity,
          unit_price: line.price?.netAmount?.amount,
          tax_rate: line.taxDetail?.percent,
          amount: line.totalAmount?.amount,
        };
      });
      return {
        id: inv.invoiceId,
        invoice_number: bd.invoiceId,
        status: inv.state ?? inv.status,
        direction: (() => {
          const d = inv.way ?? inv.metadata?.direction;
          if (!d) return undefined;
          if (d === "RECEIVED" || d === "INBOUND") return "received";
          if (d === "SENT" || d === "EMITTED" || d === "OUTBOUND") return "sent";
          return d.toLowerCase();
        })(),
        format: inv.originalFormat,
        network: inv.originalNetwork,
        invoice_type: bd.detailedType?.value,
        sender_name: bd.seller?.name,
        sender_id: bd.seller?.siret ?? bd.seller?.siren,
        sender_vat: bd.seller?.vatNumber,
        receiver_name: bd.buyer?.name,
        receiver_id: bd.buyer?.siret ?? bd.buyer?.siren,
        receiver_vat: bd.buyer?.vatNumber,
        issue_date: bd.invoiceDate,
        due_date: bd.invoiceDueDate,
        receipt_date: bd.invoiceReceiptDate,
        currency: bd.monetary?.invoiceCurrency ?? "EUR",
        total_ht: bd.monetary?.taxBasisTotalAmount?.amount,
        total_tax: bd.monetary?.taxTotalAmount?.amount,
        total_ttc: bd.monetary?.invoiceAmount?.amount,
        items: lines,
        notes: (bd.notes ?? []).map((n: Record<string, unknown>) => {
          // deno-lint-ignore no-explicit-any
          const note = n as any;
          return note.content;
        }).filter(Boolean),
      };
    },
  },

  // ── Download ────────────────────────────────────────────

  {
    name: "einvoice_invoice_download",
    description:
      "Download the source file of an invoice (original CII/UBL/Factur-X XML). " +
      "Returns base64-encoded content.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_download] 'id' is required");
      }
      const { data, contentType } = await ctx.adapter.downloadInvoice(input.id as string);
      let binary = "";
      for (let i = 0; i < data.length; i += 8192) {
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      }
      const base64 = btoa(binary);
      return { content_type: contentType, data_base64: base64, size_bytes: data.length };
    },
  },

  // ── Download readable ───────────────────────────────────

  {
    name: "einvoice_invoice_download_readable",
    description:
      "Download a human-readable PDF version of an invoice. Returns base64-encoded PDF.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_download_readable] 'id' is required");
      }
      const { data, contentType } = await ctx.adapter.downloadReadable(input.id as string);
      // Chunk-based base64 encoding to avoid stack overflow on large files
      let binary = "";
      for (let i = 0; i < data.length; i += 8192) {
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      }
      const base64 = btoa(binary);
      return { content_type: contentType, data_base64: base64, size_bytes: data.length };
    },
  },

  // ── Invoice Files ─────────────────────────────────────────

  {
    name: "einvoice_invoice_files",
    description: "Get metadata of ALL related files for an invoice (source XML, readable PDF, attachments). Use einvoice_invoice_attachments for only business attachments.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_files] 'id' is required");
      }
      return await ctx.adapter.getInvoiceFiles(input.id as string);
    },
  },

  // ── Attachments ─────────────────────────────────────────

  {
    name: "einvoice_invoice_attachments",
    description: "Get only business attachments (supporting documents, purchase orders, etc.) for an invoice. Use einvoice_invoice_files for ALL related files including source XML and PDF.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_attachments] 'id' is required");
      }
      return await ctx.adapter.getAttachments(input.id as string);
    },
  },

  // ── Download File ───────────────────────────────────────

  {
    name: "einvoice_invoice_download_file",
    description:
      "Download a specific file by its file ID. Returns base64-encoded content.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "File ID" },
      },
      required: ["file_id"],
    },
    handler: async (input, ctx) => {
      if (!input.file_id) {
        throw new Error("[einvoice_invoice_download_file] 'file_id' is required");
      }
      const { data, contentType } = await ctx.adapter.downloadFile(input.file_id as string);
      let binary = "";
      for (let i = 0; i < data.length; i += 8192) {
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      }
      const base64 = btoa(binary);
      return { content_type: contentType, data_base64: base64, size_bytes: data.length };
    },
  },

  // ── Mark as seen ────────────────────────────────────────

  {
    name: "einvoice_invoice_mark_seen",
    description: "Mark an invoice as seen/read. Useful for tracking which invoices have been processed.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_mark_seen] 'id' is required");
      }
      return await ctx.adapter.markInvoiceSeen(input.id as string);
    },
  },

  // ── Not seen ────────────────────────────────────────────

  {
    name: "einvoice_invoice_not_seen",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    description:
      "Get invoices that have not been marked as seen (PULL mode). " +
      "Useful for polling new incoming invoices.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        offset: { type: "number", description: "Result offset (default 0)" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
    handler: async (input, ctx) => {
      const result = await ctx.adapter.getUnseenInvoices({
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      }) as Record<string, unknown>;
      // Flatten + format for chat-friendly table
      const data = result.data as Record<string, unknown>[] | undefined;
      if (Array.isArray(data)) {
        // deno-lint-ignore no-explicit-any
        result.data = data.map((row: any) => {
          const m = row.metadata ?? row;
          const dateRaw = m.createDate?.split("T")[0];
          return {
            _id: m.invoiceId,
            "Statut": m.state,
            "Direction": m.direction === "INBOUND" ? "Reçue" : m.direction === "OUTBOUND" ? "Émise" : m.direction,
            "Date": dateRaw ? new Date(dateRaw).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—",
          };
        });
      }
      return {
        ...result,
        _rowAction: {
          toolName: "einvoice_invoice_get",
          idField: "_id",
          argName: "id",
        },
      };
    },
  },

  // ── Generate CII ────────────────────────────────────────

  {
    name: "einvoice_invoice_generate_cii",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    description:
      "Generate a CII invoice preview. Validates and converts to CII XML. " +
      "Returns a preview for review. Use einvoice_invoice_emit with the generated_id to send. " +
      "Requires a flavor (e.g. EN16931).",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        invoice: {
          type: "object",
          description:
            "Invoice data in Iopole format. Required fields: " +
            "invoiceId (string, max 20 chars): invoice number e.g. \"CASYS-001\"; " +
            "invoiceDate (string, YYYY-MM-DD): issue date; " +
            "type (number): invoice type code, usually 380 for commercial invoice; " +
            "processType (string): e.g. \"B1\" for goods; " +
            "invoiceDueDate (string, YYYY-MM-DD): due date; " +
            "seller (object): { name, siren, siret, country, vatNumber, electronicAddress (format \"0225:siren_siret\"), identifiers: [{ type: \"ELECTRONIC_ADDRESS\", value: \"siren_siret\", scheme: \"0225\" }] }; " +
            "buyer (object): same structure as seller; " +
            "monetary (object): { invoiceCurrency: \"EUR\", invoiceAmount: { amount }, payableAmount: { amount }, taxTotalAmount: { amount, currency: \"EUR\" }, lineTotalAmount: { amount }, taxBasisTotalAmount: { amount } }; " +
            "taxDetails (array): [{ percent, taxType: \"VAT\", categoryCode: \"S\", taxableAmount: { amount }, taxAmount: { amount } }]; " +
            "lines (array): [{ id: \"1\", item: { name }, billedQuantity: { quantity, unitCode: \"DAY\"|\"C62\" }, price: { netAmount: { amount }, baseQuantity: { quantity: 1, unitCode } }, totalAmount: { amount }, taxDetail: { percent, taxType: \"VAT\", categoryCode: \"S\" } }]; " +
            "paymentTerms (string, optional): payment conditions text; " +
            "notes (array, optional): [{ type: { code: \"PMT\" }, content: \"...\" }]",
        },
        flavor: {
          type: "string",
          description: "CII profile flavor (e.g. EN16931, MINIMUM, BASIC_WL, BASIC, EXTENDED)",
        },
      },
      required: ["invoice", "flavor"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice || !input.flavor) {
        throw new Error("[einvoice_invoice_generate_cii] 'invoice' and 'flavor' are required");
      }
      const inv = normalizeInvoiceForGenerate(input.invoice);
      const result = await ctx.adapter.generateCII({
        invoice: inv,
        flavor: input.flavor as string,
      });
      const raw = typeof result === "string" ? result : JSON.stringify(result);
      const bytes = new TextEncoder().encode(raw);
      const filename = `${inv.invoiceId ?? "invoice"}.xml`;
      const generated_id = storeGenerated(bytes, filename);
      return {
        generated_id,
        filename,
        preview: mapToViewerPreview(input.invoice),
      };
    },
  },

  // ── Generate UBL ────────────────────────────────────────

  {
    name: "einvoice_invoice_generate_ubl",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    description:
      "Generate a UBL invoice preview. Validates and converts to UBL XML. " +
      "Returns a preview for review. Use einvoice_invoice_emit with the generated_id to send. " +
      "Requires a flavor (e.g. EN16931).",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        invoice: {
          type: "object",
          description:
            "Invoice data in Iopole format. Required fields: " +
            "invoiceId (string, max 20 chars): invoice number e.g. \"CASYS-001\"; " +
            "invoiceDate (string, YYYY-MM-DD): issue date; " +
            "type (number): invoice type code, usually 380 for commercial invoice; " +
            "processType (string): e.g. \"B1\" for goods; " +
            "invoiceDueDate (string, YYYY-MM-DD): due date; " +
            "seller (object): { name, siren, siret, country, vatNumber, electronicAddress (format \"0225:siren_siret\"), identifiers: [{ type: \"ELECTRONIC_ADDRESS\", value: \"siren_siret\", scheme: \"0225\" }] }; " +
            "buyer (object): same structure as seller; " +
            "monetary (object): { invoiceCurrency: \"EUR\", invoiceAmount: { amount }, payableAmount: { amount }, taxTotalAmount: { amount, currency: \"EUR\" }, lineTotalAmount: { amount }, taxBasisTotalAmount: { amount } }; " +
            "taxDetails (array): [{ percent, taxType: \"VAT\", categoryCode: \"S\", taxableAmount: { amount }, taxAmount: { amount } }]; " +
            "lines (array): [{ id: \"1\", item: { name }, billedQuantity: { quantity, unitCode: \"DAY\"|\"C62\" }, price: { netAmount: { amount }, baseQuantity: { quantity: 1, unitCode } }, totalAmount: { amount }, taxDetail: { percent, taxType: \"VAT\", categoryCode: \"S\" } }]; " +
            "paymentTerms (string, optional): payment conditions text; " +
            "notes (array, optional): [{ type: { code: \"PMT\" }, content: \"...\" }]",
        },
        flavor: {
          type: "string",
          description: "UBL profile flavor (e.g. EN16931, MINIMUM, BASIC_WL, BASIC, EXTENDED)",
        },
      },
      required: ["invoice", "flavor"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice || !input.flavor) {
        throw new Error("[einvoice_invoice_generate_ubl] 'invoice' and 'flavor' are required");
      }
      const inv = normalizeInvoiceForGenerate(input.invoice);
      const result = await ctx.adapter.generateUBL({
        invoice: inv,
        flavor: input.flavor as string,
      });
      const raw = typeof result === "string" ? result : JSON.stringify(result);
      const bytes = new TextEncoder().encode(raw);
      const filename = `${inv.invoiceId ?? "invoice"}.xml`;
      const generated_id = storeGenerated(bytes, filename);
      return {
        generated_id,
        filename,
        preview: mapToViewerPreview(input.invoice),
      };
    },
  },

  // ── Generate Factur-X ───────────────────────────────────

  {
    name: "einvoice_invoice_generate_facturx",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    description:
      "Generate a Factur-X invoice preview. Creates a hybrid PDF/XML. " +
      "Returns a preview for review. Use einvoice_invoice_emit with the generated_id to send. " +
      "Requires a flavor (e.g. EN16931). Optionally accepts a language (FRENCH, ENGLISH, GERMAN).",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        invoice: {
          type: "object",
          description:
            "Invoice data in Iopole format. Required fields: " +
            "invoiceId (string, max 20 chars): invoice number e.g. \"CASYS-001\"; " +
            "invoiceDate (string, YYYY-MM-DD): issue date; " +
            "type (number): invoice type code, usually 380 for commercial invoice; " +
            "processType (string): e.g. \"B1\" for goods; " +
            "invoiceDueDate (string, YYYY-MM-DD): due date; " +
            "seller (object): { name, siren, siret, country, vatNumber, electronicAddress (format \"0225:siren_siret\"), identifiers: [{ type: \"ELECTRONIC_ADDRESS\", value: \"siren_siret\", scheme: \"0225\" }] }; " +
            "buyer (object): same structure as seller; " +
            "monetary (object): { invoiceCurrency: \"EUR\", invoiceAmount: { amount }, payableAmount: { amount }, taxTotalAmount: { amount, currency: \"EUR\" }, lineTotalAmount: { amount }, taxBasisTotalAmount: { amount } }; " +
            "taxDetails (array): [{ percent, taxType: \"VAT\", categoryCode: \"S\", taxableAmount: { amount }, taxAmount: { amount } }]; " +
            "lines (array): [{ id: \"1\", item: { name }, billedQuantity: { quantity, unitCode: \"DAY\"|\"C62\" }, price: { netAmount: { amount }, baseQuantity: { quantity: 1, unitCode } }, totalAmount: { amount }, taxDetail: { percent, taxType: \"VAT\", categoryCode: \"S\" } }]; " +
            "paymentTerms (string, optional): payment conditions text; " +
            "notes (array, optional): [{ type: { code: \"PMT\" }, content: \"...\" }]",
        },
        flavor: {
          type: "string",
          description: "Factur-X profile flavor (e.g. EN16931, MINIMUM, BASIC_WL, BASIC, EXTENDED)",
        },
        language: {
          type: "string",
          enum: ["FRENCH", "ENGLISH", "GERMAN"],
          description: "Language for PDF rendering: FRENCH, ENGLISH, or GERMAN",
        },
      },
      required: ["invoice", "flavor"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice || !input.flavor) {
        throw new Error("[einvoice_invoice_generate_facturx] 'invoice' and 'flavor' are required");
      }
      const inv = normalizeInvoiceForGenerate(input.invoice);
      const result = await ctx.adapter.generateFacturX({
        invoice: inv,
        flavor: input.flavor as string,
        language: input.language as string | undefined,
      });
      const raw = typeof result === "string" ? result : JSON.stringify(result);
      const bytes = new TextEncoder().encode(raw);
      const filename = `${inv.invoiceId ?? "invoice"}.pdf`;
      const generated_id = storeGenerated(bytes, filename);
      return {
        generated_id,
        filename,
        preview: mapToViewerPreview(input.invoice),
      };
    },
  },
];
