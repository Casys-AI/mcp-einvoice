/**
 * AFNOR Base Adapter (abstract)
 *
 * Base class for French PA adapters that implement the AFNOR XP Z12-013 API.
 * Provides default implementations for core operations via AfnorClient.
 *
 * Subclasses:
 *   - MUST set `name` and `capabilities`
 *   - MAY override any method to use their native API instead
 *   - SHOULD add native-only capabilities (convert, directory, webhooks...)
 *
 * If a PA doesn't have AFNOR yet (e.g. Iopole), it overrides all base methods
 * with native implementations ("passe-plat"). When the PA adds AFNOR support,
 * those overrides can be progressively removed.
 *
 * @module lib/einvoice/src/adapters/afnor/base-adapter
 */

import type {
  DownloadResult,
  EmitInvoiceRequest,
  InvoiceDetail,
  InvoiceSearchFilters,
  SearchInvoicesResult,
  SendStatusRequest,
  StatusHistoryResult,
} from "../../adapter.ts";
import type { AfnorClient } from "./client.ts";
import { BaseAdapter } from "../base-adapter.ts";
import { NotSupportedError } from "../shared/errors.ts";
import { normalizeDirection } from "../shared/direction.ts";

/**
 * Abstract base adapter for French PA using AFNOR XP Z12-013.
 *
 * Core invoice operations (submit, search, download, status) are implemented
 * via AfnorClient. Everything else must be overridden by the subclass or
 * throws NotSupportedError.
 *
 * The AfnorClient can be null (PA doesn't expose AFNOR yet) — in that case,
 * all methods throw unless the subclass overrides them with native implementations.
 */
export abstract class AfnorBaseAdapter extends BaseAdapter {
  protected afnor: AfnorClient | null;

  constructor(afnor: AfnorClient | null) {
    super();
    this.afnor = afnor;
  }

  // ─── Invoice Operations (AFNOR: submitFlow, searchFlows, downloadFlow) ───

  override async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    const afnor = this.requireAfnor("emitInvoice");
    const syntax = req.filename.toLowerCase().endsWith(".pdf")
      ? "Factur-X"
      : "CII";
    return await afnor.submitFlow(
      req.file,
      { flowSyntax: syntax, name: req.filename, processingRule: "B2B" },
    );
  }

  override async searchInvoices(
    filters: InvoiceSearchFilters,
  ): Promise<SearchInvoicesResult> {
    const afnor = this.requireAfnor("searchInvoices");
    const result = await afnor.searchFlows(
      {
        flowType: ["CustomerInvoice", "SupplierInvoice"],
        ...(filters.q ? { trackingId: filters.q } : {}),
      },
      filters.limit,
    );
    // deno-lint-ignore no-explicit-any
    const rows = (result.results ?? []).map((r: any) => ({
      id: r.flowId ?? "",
      status: r.ackStatus,
      direction: normalizeDirection(r.flowDirection),
      date: r.updatedAt ?? r.submittedAt,
    }));
    return { rows, count: rows.length };
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    const afnor = this.requireAfnor("getInvoice");
    const { data, contentType } = await afnor.downloadFlow(id);
    if (contentType.includes("json")) {
      // deno-lint-ignore no-explicit-any
      const doc = JSON.parse(new TextDecoder().decode(data)) as any;
      return {
        id,
        invoiceNumber: doc.invoiceId ?? doc.invoiceNumber,
        status: doc.ackStatus ?? doc.status,
        direction: normalizeDirection(doc.flowDirection),
        senderName: doc.seller?.name,
        receiverName: doc.buyer?.name,
        issueDate: doc.invoiceDate,
        currency: doc.currency ?? "EUR",
      };
    }
    return { id, status: "UNKNOWN" };
  }

  override async downloadInvoice(id: string): Promise<DownloadResult> {
    const afnor = this.requireAfnor("downloadInvoice");
    return await afnor.downloadFlow(id, "Original");
  }

  // ─── Status (AFNOR: lifecycle flows) ───────────────────

  override async sendStatus(req: SendStatusRequest): Promise<unknown> {
    const afnor = this.requireAfnor("sendStatus");
    // Lifecycle events are submitted as CDAR flows
    const cdarPayload = JSON.stringify({
      invoiceId: req.invoiceId,
      statusCode: req.code,
      message: req.message,
      payment: req.payment,
    });
    return await afnor.submitFlow(
      new TextEncoder().encode(cdarPayload),
      {
        flowSyntax: "CDAR",
        name: `status-${req.invoiceId}.json`,
        processingRule: "B2B",
      },
    );
  }

  override async getStatusHistory(
    invoiceId: string,
  ): Promise<StatusHistoryResult> {
    const afnor = this.requireAfnor("getStatusHistory");
    const result = await afnor.searchFlows({
      flowType: ["CustomerInvoiceLC", "SupplierInvoiceLC"],
      trackingId: invoiceId,
    });
    // deno-lint-ignore no-explicit-any
    const entries = (result.results ?? []).map((r: any) => ({
      date: r.updatedAt ?? r.submittedAt ?? "",
      code: r.ackStatus ?? "",
      message: r.flowType,
      destType: r.flowDirection === "In" ? "PLATFORM" : "OPERATOR",
    }));
    return { entries };
  }

  // ─── Reporting (AFNOR: e-reporting flows) ──────────────

  override async reportInvoiceTransaction(
    transaction: Record<string, unknown>,
  ): Promise<unknown> {
    const afnor = this.requireAfnor("reportInvoiceTransaction");
    const payload = new TextEncoder().encode(JSON.stringify(transaction));
    return await afnor.submitFlow(
      payload,
      { flowSyntax: "FRR", name: "report.json", processingRule: "B2C" },
    );
  }

  override async reportTransaction(
    businessEntityId: string,
    transaction: Record<string, unknown>,
  ): Promise<unknown> {
    const afnor = this.requireAfnor("reportTransaction");
    const payload = new TextEncoder().encode(
      JSON.stringify({ businessEntityId, ...transaction }),
    );
    return await afnor.submitFlow(
      payload,
      { flowSyntax: "FRR", name: "report.json", processingRule: "B2C" },
    );
  }

  // All other methods inherit NotSupportedError stubs from BaseAdapter.
  // Subclasses override with native API implementations.

  // ─── Helpers ───────────────────────────────────────────

  /** Get the AFNOR client or throw if not configured. */
  protected requireAfnor(method: string): AfnorClient {
    if (!this.afnor) {
      throw new NotSupportedError(
        this.name,
        method,
        "AFNOR API not configured. Override this method with native implementation.",
      );
    }
    return this.afnor;
  }
}
