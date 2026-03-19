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
  EInvoiceAdapter,
  StatusHistoryResult,
  DownloadResult,
  PaginatedRequest,
  EmitInvoiceRequest,
  InvoiceSearchFilters,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  SendStatusRequest,
  GenerateInvoiceRequest,
  GenerateFacturXRequest,
  CreateWebhookRequest,
  UpdateWebhookRequest,
} from "../../adapter.ts";
import type { AfnorClient } from "./client.ts";

/**
 * Error for operations not supported by the AFNOR standard
 * and not overridden by the native adapter.
 */
class NotSupportedError extends Error {
  constructor(method: string, alternative: string) {
    super(`[AfnorBaseAdapter] ${method} is not covered by AFNOR. ${alternative}`);
    this.name = "NotSupportedError";
  }
}

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
export abstract class AfnorBaseAdapter implements EInvoiceAdapter {
  abstract readonly name: string;
  abstract readonly capabilities: Set<string>;

  protected afnor: AfnorClient | null;

  constructor(afnor: AfnorClient | null) {
    this.afnor = afnor;
  }

  // ─── Invoice Operations (AFNOR: submitFlow, searchFlows, downloadFlow) ───

  async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    if (!this.afnor) throw this.noAfnor("emitInvoice");
    const syntax = req.filename.toLowerCase().endsWith(".pdf") ? "Factur-X" : "CII";
    return await this.afnor.submitFlow(
      req.file,
      { flowSyntax: syntax, name: req.filename, processingRule: "B2B" },
      "CustomerInvoice",
    );
  }

  async searchInvoices(filters: InvoiceSearchFilters): Promise<unknown> {
    if (!this.afnor) throw this.noAfnor("searchInvoices");
    return await this.afnor.searchFlows(
      {
        flowType: ["CustomerInvoice", "SupplierInvoice"],
        ...(filters.q ? { trackingId: filters.q } : {}),
      },
      filters.limit,
    );
  }

  async getInvoice(id: string): Promise<unknown> {
    if (!this.afnor) throw this.noAfnor("getInvoice");
    // Download the flow file as JSON representation
    const { data, contentType } = await this.afnor.downloadFlow(id);
    if (contentType.includes("json")) {
      return JSON.parse(new TextDecoder().decode(data));
    }
    // Return raw metadata if not JSON
    return { flowId: id, contentType, size: data.length };
  }

  async downloadInvoice(id: string): Promise<DownloadResult> {
    if (!this.afnor) throw this.noAfnor("downloadInvoice");
    return await this.afnor.downloadFlow(id);
  }

  // ─── Status (AFNOR: lifecycle flows) ───────────────────

  async sendStatus(req: SendStatusRequest): Promise<unknown> {
    if (!this.afnor) throw this.noAfnor("sendStatus");
    // Lifecycle events are submitted as CDAR flows
    const cdarPayload = JSON.stringify({
      invoiceId: req.invoiceId,
      statusCode: req.code,
      message: req.message,
      payment: req.payment,
    });
    return await this.afnor.submitFlow(
      new TextEncoder().encode(cdarPayload),
      { flowSyntax: "CDAR", name: `status-${req.invoiceId}.json`, processingRule: "B2B" },
      "CustomerInvoiceLC",
    );
  }

  async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    if (!this.afnor) throw this.noAfnor("getStatusHistory");
    const result = await this.afnor.searchFlows({
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

  async reportInvoiceTransaction(transaction: Record<string, unknown>): Promise<unknown> {
    if (!this.afnor) throw this.noAfnor("reportInvoiceTransaction");
    const payload = new TextEncoder().encode(JSON.stringify(transaction));
    return await this.afnor.submitFlow(
      payload,
      { flowSyntax: "FRR", name: "report.json", processingRule: "B2C" },
      "UnitaryCustomerTransactionReport",
    );
  }

  async reportTransaction(businessEntityId: string, transaction: Record<string, unknown>): Promise<unknown> {
    if (!this.afnor) throw this.noAfnor("reportTransaction");
    const payload = new TextEncoder().encode(JSON.stringify({ businessEntityId, ...transaction }));
    return await this.afnor.submitFlow(
      payload,
      { flowSyntax: "FRR", name: "report.json", processingRule: "B2C" },
      "AggregatedCustomerTransactionReport",
    );
  }

  // ─── Not covered by AFNOR — subclass must override or leave as stub ───

  async downloadReadable(_id: string): Promise<DownloadResult> {
    throw new NotSupportedError("downloadReadable", "Override in subclass with native API.");
  }

  async getInvoiceFiles(_id: string): Promise<unknown> {
    throw new NotSupportedError("getInvoiceFiles", "AFNOR flows are atomic. Override in subclass.");
  }

  async getAttachments(_id: string): Promise<unknown> {
    throw new NotSupportedError("getAttachments", "Override in subclass with native API.");
  }

  async downloadFile(_fileId: string): Promise<DownloadResult> {
    throw new NotSupportedError("downloadFile", "Override in subclass with native API.");
  }

  async markInvoiceSeen(_id: string): Promise<unknown> {
    throw new NotSupportedError("markInvoiceSeen", "Not in AFNOR spec.");
  }

  async getUnseenInvoices(_pagination: PaginatedRequest): Promise<unknown> {
    throw new NotSupportedError("getUnseenInvoices", "Not in AFNOR spec.");
  }

  async generateCII(_req: GenerateInvoiceRequest): Promise<string> {
    throw new NotSupportedError("generateCII", "Override in subclass if PA has format conversion.");
  }

  async generateUBL(_req: GenerateInvoiceRequest): Promise<string> {
    throw new NotSupportedError("generateUBL", "Override in subclass if PA has format conversion.");
  }

  async generateFacturX(_req: GenerateFacturXRequest): Promise<DownloadResult> {
    throw new NotSupportedError("generateFacturX", "Override in subclass if PA has format conversion.");
  }

  // ─── Directory — not in AFNOR, subclass must override ─

  async searchDirectoryFr(_filters: DirectoryFrSearchFilters): Promise<unknown> {
    throw new NotSupportedError("searchDirectoryFr", "Override in subclass with native API.");
  }

  async searchDirectoryInt(_filters: DirectoryIntSearchFilters): Promise<unknown> {
    throw new NotSupportedError("searchDirectoryInt", "Not in AFNOR spec. Override in subclass.");
  }

  async checkPeppolParticipant(_scheme: string, _value: string): Promise<unknown> {
    throw new NotSupportedError("checkPeppolParticipant", "Not in AFNOR spec.");
  }

  // ─── Status extras ─────────────────────────────────────

  async getUnseenStatuses(_pagination: PaginatedRequest): Promise<unknown> {
    throw new NotSupportedError("getUnseenStatuses", "Not in AFNOR spec.");
  }

  async markStatusSeen(_statusId: string): Promise<unknown> {
    throw new NotSupportedError("markStatusSeen", "Not in AFNOR spec.");
  }

  // ─── Webhooks — not in AFNOR (yet) ────────────────────

  async listWebhooks(): Promise<unknown> {
    throw new NotSupportedError("listWebhooks", "Not in AFNOR spec. Override in subclass.");
  }

  async getWebhook(_id: string): Promise<unknown> {
    throw new NotSupportedError("getWebhook", "Not in AFNOR spec.");
  }

  async createWebhook(_req: CreateWebhookRequest): Promise<unknown> {
    throw new NotSupportedError("createWebhook", "Not in AFNOR spec.");
  }

  async updateWebhook(_id: string, _req: UpdateWebhookRequest): Promise<unknown> {
    throw new NotSupportedError("updateWebhook", "Not in AFNOR spec.");
  }

  async deleteWebhook(_id: string): Promise<unknown> {
    throw new NotSupportedError("deleteWebhook", "Not in AFNOR spec.");
  }

  // ─── Operator Config — not in AFNOR ───────────────────

  async getCustomerId(): Promise<unknown> {
    throw new NotSupportedError("getCustomerId", "Override in subclass with native API.");
  }

  async listBusinessEntities(): Promise<unknown> {
    throw new NotSupportedError("listBusinessEntities", "Override in subclass with native API.");
  }

  async getBusinessEntity(_id: string): Promise<unknown> {
    throw new NotSupportedError("getBusinessEntity", "Override in subclass with native API.");
  }

  async createLegalUnit(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("createLegalUnit", "Override in subclass with native API.");
  }

  async createOffice(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("createOffice", "Override in subclass with native API.");
  }

  async deleteBusinessEntity(_id: string): Promise<unknown> {
    throw new NotSupportedError("deleteBusinessEntity", "Override in subclass with native API.");
  }

  async configureBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("configureBusinessEntity", "Override in subclass with native API.");
  }

  async claimBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("claimBusinessEntity", "Override in subclass.");
  }

  async claimBusinessEntityByIdentifier(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("claimBusinessEntityByIdentifier", "Override in subclass.");
  }

  async enrollFrench(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("enrollFrench", "Override in subclass with native API.");
  }

  async enrollInternational(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("enrollInternational", "Override in subclass.");
  }

  async registerNetwork(_identifierId: string, _network: string): Promise<unknown> {
    throw new NotSupportedError("registerNetwork", "Override in subclass with native API.");
  }

  async registerNetworkByScheme(_scheme: string, _value: string, _network: string): Promise<unknown> {
    throw new NotSupportedError("registerNetworkByScheme", "Override in subclass.");
  }

  async unregisterNetwork(_directoryId: string): Promise<unknown> {
    throw new NotSupportedError("unregisterNetwork", "Override in subclass.");
  }

  async createIdentifier(_entityId: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("createIdentifier", "Override in subclass with native API.");
  }

  async createIdentifierByScheme(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError("createIdentifierByScheme", "Override in subclass.");
  }

  async deleteIdentifier(_identifierId: string): Promise<unknown> {
    throw new NotSupportedError("deleteIdentifier", "Override in subclass.");
  }

  async deleteClaim(_entityId: string): Promise<unknown> {
    throw new NotSupportedError("deleteClaim", "Override in subclass.");
  }

  // ─── Helpers ───────────────────────────────────────────

  private noAfnor(method: string): Error {
    return new Error(
      `[${this.name}] ${method}: AFNOR API not configured. ` +
      `Override this method with native implementation.`,
    );
  }
}
