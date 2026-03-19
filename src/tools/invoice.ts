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

/** Encode a Uint8Array to base64, chunked to avoid stack overflow on large files. */
function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 8192) {
    binary += String.fromCharCode(...data.subarray(i, i + 8192));
  }
  return btoa(binary);
}


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
 * Map invoice input to invoice-viewer preview format.
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


/** Shared AX hint for generate tools — tells the LLM to check entities first. */
const GENERATE_AX_HINT =
  "Before generating, call einvoice_config_entities_list — the seller MUST be a registered entity " +
  "(exact SIRET/SIREN/name) or the invoice gets WRONG_ROUTING. " +
  "After generating, the user can submit directly via the viewer button. ";

/** Shared description for the invoice input schema (used by generate_cii/ubl/facturx). */
const INVOICE_SCHEMA_DESCRIPTION =
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
  "notes (array, optional): [{ type: { code: \"PMT\" }, content: \"...\" }]";

export const invoiceTools: EInvoiceTool[] = [
  // ── Emit ────────────────────────────────────────────────

  {
    name: "einvoice_invoice_submit",
    requires: ["emitInvoice"],
    description:
      "Submit an invoice to the e-invoicing platform. " +
      "Provide EITHER a generated_id (from a generate preview) OR file_base64 + filename. " +
      "Returns a GUID. The platform then validates, issues (ISSUED), and delivers it automatically.",
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
            "[einvoice_invoice_submit] Generated file expired or not found. " +
            "Regenerate the invoice first.",
          );
        }
        return await ctx.adapter.emitInvoice(stored);
      }

      // Path 2: direct base64 upload (existing behavior)
      if (!input.file_base64 || !input.filename) {
        throw new Error(
          "[einvoice_invoice_submit] Provide either 'generated_id' or both 'file_base64' and 'filename'",
        );
      }
      const filename = input.filename as string;
      const lower = filename.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".xml")) {
        throw new Error("[einvoice_invoice_submit] filename must end in .pdf or .xml");
      }
      // Decode base64 to Uint8Array
      let binaryString: string;
      try {
        binaryString = atob(input.file_base64 as string);
      } catch {
        throw new Error("[einvoice_invoice_submit] 'file_base64' is not valid base64");
      }
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
    requires: ["searchInvoices"],
    description:
      "Search invoices. Use direction and status to filter. " +
      "Query searches by sender name, receiver name, or invoice number. " +
      "Use the direction and status parameters for filtering — not the query.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query (e.g. company name, invoice number). Omit to list all.",
        },
        direction: {
          type: "string",
          description: "Filter by direction",
          enum: ["received", "sent"],
        },
        status: {
          type: "string",
          description: "Filter by lifecycle status (after enrichment)",
          enum: [
            "SUBMITTED", "ISSUED", "MADE_AVAILABLE", "DELIVERED",
            "IN_HAND", "APPROVED", "PARTIALLY_APPROVED",
            "REFUSED", "DISPUTED", "SUSPENDED",
            "PAYMENT_SENT", "PAYMENT_RECEIVED", "COMPLETED",
            "WRONG_ROUTING", "INVALID", "DUPLICATED",
          ],
        },
        offset: { type: "number", description: "Result offset (default 0)" },
        limit: { type: "number", description: "Max results (default 50, max 200)" },
      },
    },
    handler: async (input, ctx) => {
      // Sanitize q: undefined, empty, whitespace-only, or wildcard-only → omit (list all)
      let q = input.q as string | undefined;
      if (q != null && /^\s*\*?\s*$/.test(q)) q = undefined;

      // Adapter returns normalized SearchInvoicesResult (with status enrichment done internally)
      const { rows, count } = await ctx.adapter.searchInvoices({
        q,
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      });

      // Direction filter
      const dirFilter = input.direction as string | undefined;
      let filtered = rows;
      if (dirFilter) {
        filtered = filtered.filter((r) => r.direction === dirFilter);
      }

      // Status filter
      const statusFilter = input.status as string | undefined;
      if (statusFilter) {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }

      // Format for French doclist-viewer
      const data = filtered.map((r) => ({
        _id: r.id,
        "N°": r.invoiceNumber ?? "—",
        "Statut": r.status ?? "—",
        ...(dirFilter ? {} : {
          "Direction": r.direction === "received" ? "Entrante" : r.direction === "sent" ? "Sortante" : "—",
        }),
        "Émetteur": r.senderName ?? "—",
        "Destinataire": r.receiverName ?? "—",
        "Date": r.date ? new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—",
        "Montant": r.amount != null ? `${Number(r.amount).toLocaleString("fr-FR")} ${r.currency ?? "EUR"}` : "—",
      }));

      // Dynamic title
      const dirLabel = dirFilter === "received" ? "reçues" : dirFilter === "sent" ? "envoyées" : "";
      const statusLabel = statusFilter ?? "";
      const titleParts = ["Factures", dirLabel, statusLabel ? `(${statusLabel})` : ""].filter(Boolean);

      return {
        data,
        count: filtered.length,
        _title: titleParts.join(" "),
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
    requires: ["getInvoice"],
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
      const id = input.id as string;

      // Adapter returns normalized InvoiceDetail (with status enrichment done internally)
      const inv = await ctx.adapter.getInvoice(id);

      // Map to viewer format (snake_case for invoice-viewer compatibility)
      const isTerminal = ["REFUSED", "COMPLETED", "CANCELLED", "PAYMENT_RECEIVED", "UNKNOWN"].includes(inv.status ?? "");
      return {
        id: inv.id,
        invoice_number: inv.invoiceNumber,
        status: inv.status,
        direction: inv.direction,
        format: inv.format,
        network: inv.network,
        invoice_type: inv.invoiceType,
        sender_name: inv.senderName,
        sender_id: inv.senderId,
        sender_vat: inv.senderVat,
        receiver_name: inv.receiverName,
        receiver_id: inv.receiverId,
        receiver_vat: inv.receiverVat,
        issue_date: inv.issueDate,
        due_date: inv.dueDate,
        receipt_date: inv.receiptDate,
        currency: inv.currency,
        total_ht: inv.totalHt,
        total_tax: inv.totalTax,
        total_ttc: inv.totalTtc,
        items: inv.lines?.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          tax_rate: l.taxRate,
          amount: l.amount,
        })),
        notes: inv.notes,
        ...(!isTerminal && inv.direction !== "received"
          ? { refreshRequest: { toolName: "einvoice_invoice_get", arguments: { id } } }
          : {}),
      };
    },
  },

  // ── Download ────────────────────────────────────────────

  {
    name: "einvoice_invoice_download",
    requires: ["downloadInvoice"],
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
      return { content_type: contentType, data_base64: uint8ToBase64(data), size_bytes: data.length };
    },
  },

  // ── Download readable ───────────────────────────────────

  {
    name: "einvoice_invoice_download_readable",
    requires: ["downloadReadable"],
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
      return { content_type: contentType, data_base64: uint8ToBase64(data), size_bytes: data.length };
    },
  },

  // ── Invoice Files ─────────────────────────────────────────

  {
    name: "einvoice_invoice_files",
    requires: ["getInvoiceFiles"],
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
    requires: ["getAttachments"],
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
    requires: ["downloadFile"],
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
      return { content_type: contentType, data_base64: uint8ToBase64(data), size_bytes: data.length };
    },
  },

  // ── seen/notSeen tools removed ──────────────────────────
  // Iopole's seen/notSeen mechanism is opaque: `seen` is not exposed in
  // search or getInvoice, and `notSeen` always returns empty in PUSH mode
  // (active webhook). Removed in v0.2.0 — see docs/CHANGELOG.md.

  // ── Generate CII ────────────────────────────────────────

  {
    name: "einvoice_invoice_generate_cii",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    requires: ["generateCII"],
    description:
      GENERATE_AX_HINT +
      "Generate a CII invoice preview. Validates and converts to CII XML. " +
      "Returns a preview for review. Use einvoice_invoice_submit with the generated_id to send. " +
      "Requires a flavor (e.g. EN16931).",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        invoice: {
          type: "object",
          description: INVOICE_SCHEMA_DESCRIPTION,
        },
        flavor: {
          type: "string",
          description: "CII profile flavor",
          enum: ["EN16931", "EXTENDED"],
        },
      },
      required: ["invoice", "flavor"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice || !input.flavor) {
        throw new Error("[einvoice_invoice_generate_cii] 'invoice' and 'flavor' are required");
      }
      const inv = normalizeInvoiceForGenerate(input.invoice);
      const xml = await ctx.adapter.generateCII({
        invoice: inv,
        flavor: input.flavor as string,
      });
      const bytes = new TextEncoder().encode(xml);
      const filename = `${inv.invoiceId ?? "invoice"}.xml`;
      const generated_id = storeGenerated(bytes, filename);
      return {
        generated_id,
        filename,
        preview: mapToViewerPreview(inv),
      };
    },
  },

  // ── Generate UBL ────────────────────────────────────────

  {
    name: "einvoice_invoice_generate_ubl",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    requires: ["generateUBL"],
    description:
      GENERATE_AX_HINT +
      "Generate a UBL invoice preview. Validates and converts to UBL XML. " +
      "Returns a preview for review. Use einvoice_invoice_submit with the generated_id to send. " +
      "Requires a flavor (e.g. EN16931).",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        invoice: {
          type: "object",
          description: INVOICE_SCHEMA_DESCRIPTION,
        },
        flavor: {
          type: "string",
          description: "UBL profile flavor",
          enum: ["EN16931", "PEPPOL_BIS_3"],
        },
      },
      required: ["invoice", "flavor"],
    },
    handler: async (input, ctx) => {
      if (!input.invoice || !input.flavor) {
        throw new Error("[einvoice_invoice_generate_ubl] 'invoice' and 'flavor' are required");
      }
      const inv = normalizeInvoiceForGenerate(input.invoice);
      const xml = await ctx.adapter.generateUBL({
        invoice: inv,
        flavor: input.flavor as string,
      });
      const bytes = new TextEncoder().encode(xml);
      const filename = `${inv.invoiceId ?? "invoice"}.xml`;
      const generated_id = storeGenerated(bytes, filename);
      return {
        generated_id,
        filename,
        preview: mapToViewerPreview(inv),
      };
    },
  },

  // ── Generate Factur-X ───────────────────────────────────

  {
    name: "einvoice_invoice_generate_facturx",
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/invoice-viewer" } },
    requires: ["generateFacturX"],
    description:
      GENERATE_AX_HINT +
      "Generate a Factur-X invoice preview. Creates a hybrid PDF/XML. " +
      "Returns a preview for review. Use einvoice_invoice_submit with the generated_id to send. " +
      "Requires a flavor (e.g. EN16931). Optionally accepts a language (FRENCH, ENGLISH, GERMAN).",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        invoice: {
          type: "object",
          description: INVOICE_SCHEMA_DESCRIPTION,
        },
        flavor: {
          type: "string",
          description: "Factur-X profile flavor",
          enum: ["BASICWL", "EN16931", "EXTENDED"],
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
      const { data: bytes } = await ctx.adapter.generateFacturX({
        invoice: inv,
        flavor: input.flavor as string,
        language: input.language as string | undefined,
      });
      const filename = `${inv.invoiceId ?? "invoice"}.pdf`;
      const generated_id = storeGenerated(bytes, filename);
      return {
        generated_id,
        filename,
        preview: mapToViewerPreview(inv),
      };
    },
  },
];
