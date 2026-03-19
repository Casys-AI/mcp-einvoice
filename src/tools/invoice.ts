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

/** Map Iopole direction codes to viewer-friendly lowercase values. */
function normalizeDirection(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw === "RECEIVED" || raw === "INBOUND") return "received";
  if (raw === "SENT" || raw === "EMITTED" || raw === "OUTBOUND") return "sent";
  return raw.toLowerCase();
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

/**
 * Extract the latest status code from a normalized StatusHistoryResult.
 * Optionally filter by destType to avoid cross-contamination.
 */
function extractLatestStatusCode(history: { entries: Array<{ date: string; code: string; destType?: string }> }, destTypeFilter?: string): string | undefined {
  let entries = history.entries;
  if (!entries || entries.length === 0) return undefined;
  if (destTypeFilter) {
    const filtered = entries.filter((e) => e.destType === destTypeFilter);
    if (filtered.length > 0) entries = filtered;
  }
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return entries[0].code;
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
      "Query uses Lucene syntax — valid fields: senderName, receiverName, invoiceId. " +
      "Note: 'status', 'direction' are NOT valid Lucene fields — use the parameters instead.",
    category: "invoice",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Lucene search query. Examples: 'senderName:Acme'. Omit to list all.",
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

      const result = await ctx.adapter.searchInvoices({
        q,
        expand: (input.expand as string | undefined) ?? "businessData",
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      }) as Record<string, unknown>;

      // Lift meta.count to top-level for doclist-viewer
      const meta = result.meta as Record<string, unknown> | undefined;
      if (meta?.count != null && result.count == null) result.count = meta.count;

      // Server-side direction filter (Iopole doesn't support direction in Lucene)
      const dirFilter = input.direction as string | undefined;
      if (dirFilter && Array.isArray(result.data)) {
        const iopoleDir = dirFilter === "received" ? "INBOUND" : dirFilter === "sent" ? "OUTBOUND" : null;
        if (iopoleDir) {
          // deno-lint-ignore no-explicit-any
          result.data = (result.data as any[]).filter((row: any) => row.metadata?.direction === iopoleDir);
          result.count = (result.data as unknown[]).length;
        }
      }

      // Flatten + format for a chat-friendly table
      const data = result.data as Record<string, unknown>[] | undefined;
      if (Array.isArray(data)) {
        // deno-lint-ignore no-explicit-any
        const rows = data.map((row: any) => {
          const m = row.metadata ?? {};
          const bd = row.businessData ?? {};
          const dateRaw = bd.invoiceDate ?? m.createDate?.split("T")[0];
          const amount = bd.monetary?.invoiceAmount?.amount;
          const currency = bd.monetary?.invoiceCurrency ?? "EUR";
          return {
            _id: m.invoiceId,
            _state: m.state,
            _direction: m.direction, // raw INBOUND/OUTBOUND for drill-down fallback
            "N°": bd.invoiceId ?? "—",
            "Statut": m.state, // will be enriched with lifecycle status below
            "Direction": m.direction === "INBOUND" ? "Entrante" : m.direction === "OUTBOUND" ? "Sortante" : m.direction,
            "Émetteur": bd.seller?.name ?? "—",
            "Destinataire": bd.buyer?.name ?? "—",
            "Date": dateRaw ? new Date(dateRaw).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—",
            "Montant": amount != null ? `${Number(amount).toLocaleString("fr-FR")} ${currency}` : "—",
          };
        });

        // Enrich with lifecycle status — batch fetch status history in parallel.
        // Both OUTBOUND and INBOUND show the latest status (Iopole replicates
        // receiver actions into sender history, so the sender sees APPROVED etc.)
        const enrichPromises = rows.map(async (row) => {
          if (!row._id) return;
          try {
            const history = await ctx.adapter.getStatusHistory(row._id);
            const code = extractLatestStatusCode(history);
            if (code) row["Statut"] = code;
          } catch { /* keep processing state as fallback */ }
        });
        await Promise.all(enrichPromises);

        // Server-side status filter (after lifecycle enrichment)
        const statusFilter = input.status as string | undefined;
        let filteredRows = rows;
        if (statusFilter) {
          filteredRows = rows.filter((row) => row["Statut"] === statusFilter);
        }

        // Hide Direction column when filtered (redundant)
        if (dirFilter) {
          for (const row of filteredRows) delete (row as Record<string, unknown>)["Direction"];
        }

        result.data = filteredRows;
        result.count = filteredRows.length;
      }

      // Dynamic title
      const dirLabel = dirFilter === "received" ? "reçues" : dirFilter === "sent" ? "envoyées" : "";
      const statusLabel = (input.status as string) ?? "";
      const titleParts = ["Factures", dirLabel, statusLabel ? `(${statusLabel})` : ""].filter(Boolean);

      return {
        ...result,
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

      // Fetch invoice and status history in parallel.
      // getInvoice doesn't return state — we need getStatusHistory for the latest status.
      const [raw, historyRaw] = await Promise.all([
        ctx.adapter.getInvoice(id),
        ctx.adapter.getStatusHistory(id).catch(() => null),
      ]);

      // Map Iopole structure to invoice-viewer format
      // deno-lint-ignore no-explicit-any
      const inv = (Array.isArray(raw) ? raw[0] : raw) as any;
      const latestStatus = historyRaw ? extractLatestStatusCode(historyRaw) : undefined;
      if (!inv?.businessData) {
        const status = latestStatus ?? inv?.state ?? inv?.status ?? "UNKNOWN";
        // Don't set refreshRequest for INBOUND or terminal statuses — they won't gain businessData
        const isTerminal = ["REFUSED", "COMPLETED", "CANCELLED", "PAYMENT_RECEIVED", "UNKNOWN"].includes(status);
        const isInbound = inv?.way === "RECEIVED";
        return {
          id: inv?.invoiceId,
          status,
          direction: normalizeDirection(inv?.way ?? inv?.metadata?.direction),
          format: inv?.originalFormat,
          network: inv?.originalNetwork,
          issue_date: inv?.date,
          ...(!isTerminal && !isInbound ? { refreshRequest: { toolName: "einvoice_invoice_get", arguments: { id } } } : {}),
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
        status: latestStatus ?? inv.state ?? inv.status,
        direction: normalizeDirection(inv.way ?? inv.metadata?.direction),
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
        refreshRequest: { toolName: "einvoice_invoice_get", arguments: { id } },
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
      const result = await ctx.adapter.generateFacturX({
        invoice: inv,
        flavor: input.flavor as string,
        language: input.language as string | undefined,
      });
      // Factur-X returns { data: Uint8Array, contentType } from postBinary
      const binary = result as { data: Uint8Array; contentType: string };
      const bytes = binary.data instanceof Uint8Array ? binary.data : new TextEncoder().encode(typeof result === "string" ? result : JSON.stringify(result));
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
