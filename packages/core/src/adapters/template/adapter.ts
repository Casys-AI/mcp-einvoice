/**
 * Template Adapter
 *
 * INSTRUCTIONS: Copy this directory to create a new adapter.
 *
 * DECISION TREE:
 * 1. French PA with AFNOR XP Z12-013 support?
 *    → Extend AfnorBaseAdapter (like SUPER PDP)
 *    → AfnorBaseAdapter handles: searchDirectoryFr, reportInvoiceTransaction,
 *      reportTransaction via AFNOR flow API
 *
 * 2. French PA without AFNOR?
 *    → Extend BaseAdapter directly (like Iopole)
 *    → Override all methods your API supports
 *
 * 3. Non-French platform (Peppol, etc.)?
 *    → Extend BaseAdapter directly (like Storecove)
 *    → Only override methods your platform supports
 *    → Unsupported methods auto-throw NotSupportedError
 *
 * IMPORTANT:
 * - Override capabilities getter to declare supported methods
 * - Each method must return the TYPED return format (InvoiceDetail, etc.)
 * - Normalize your API responses to the shared types
 * - Use encodePathSegment() on all URL path interpolations
 *
 * @module adapters/template/adapter
 */

import { BaseAdapter } from "../base-adapter.ts";
// Or: import { AfnorBaseAdapter } from "../afnor/base-adapter.ts";
import type {
  AdapterMethodName,
  InvoiceDetail,
  SearchInvoicesResult,
  SearchDirectoryFrResult,
  StatusHistoryResult,
} from "../../adapter.ts";
import { TemplateClient } from "./client.ts";
import type { TemplateClientConfig } from "./client.ts";

export class TemplateAdapter extends BaseAdapter {
  private client: TemplateClient;

  constructor(config: TemplateClientConfig) {
    super();
    this.client = new TemplateClient(config);
  }

  // ── Identity ──────────────────────────────────
  override get name(): string {
    return "template"; // lowercase, used as adapter ID
  }

  // ── Capabilities ──────────────────────────────
  // Declare which methods your adapter supports.
  // Only tools whose `requires` match these will be exposed.
  // Start small and add capabilities as you implement them.
  override get capabilities(): Set<AdapterMethodName> {
    return new Set([
      // Core invoice operations (implement these first):
      // "searchInvoices",
      // "getInvoice",
      // "emitInvoice",
      // "downloadInvoice",

      // Status lifecycle:
      // "getStatusHistory",
      // "sendStatus",

      // Directory:
      // "searchDirectoryFr",
      // "searchDirectoryInt",
      // "checkPeppolParticipant",

      // Configuration:
      // "getCustomerId",
      // "listBusinessEntities",
      // "getBusinessEntity",
      // ... add more as needed
    ]);
  }

  // ── Invoice Methods ───────────────────────────
  // Uncomment and implement as your API supports them.

  /*
  override async searchInvoices(params: {
    q?: string;
    direction?: "sent" | "received";
    status?: string;
    offset?: number;
    limit?: number;
  }): Promise<SearchInvoicesResult> {
    // 1. Map params to your API format
    // 2. Call this.client.get("/your-endpoint", { query params })
    // 3. Normalize response to SearchInvoicesResult { rows, count }
    //
    // Each row must have: id, invoiceNumber, senderName, receiverName,
    // direction ("sent"|"received"), status, date, amount, currency
    throw new Error("TODO: implement searchInvoices");
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    // Return full invoice detail — used by invoice-viewer
    // Must include: id, invoiceNumber, direction, status,
    // senderName/receiverName, lines[], notes[]
    throw new Error("TODO: implement getInvoice");
  }

  override async emitInvoice(
    data: { file: Uint8Array; filename: string } | Record<string, unknown>,
  ): Promise<unknown> {
    // If your API accepts file upload: use this.client.upload()
    // If your API accepts JSON: use this.client.post()
    throw new Error("TODO: implement emitInvoice");
  }
  */

  // ── Status Methods ────────────────────────────

  /*
  override async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    // Return { entries: StatusEntry[] }
    // Each entry: { code, label?, date, actor? }
    // Use CDAR codes when possible (200=Déposée, 205=Approuvée, etc.)
    throw new Error("TODO: implement getStatusHistory");
  }

  override async sendStatus(params: {
    invoiceId: string;
    code: string;
    message?: string;
    payment?: Record<string, unknown>;
  }): Promise<unknown> {
    throw new Error("TODO: implement sendStatus");
  }
  */

  // ── Normalization ─────────────────────────────
  //
  // If your adapter accepts freeform invoice data for emission,
  // add a normalizeForTemplate() function in a separate normalize.ts file.
  // Follow the NormalizeFn type from shared/types.ts.
  //
  // See examples:
  // - packages/core/src/adapters/superpdp/normalize.ts (415 lines, full EN16931)
  // - packages/core/src/adapters/iopole/adapter.ts:613-666 (54 lines, inline)
}
