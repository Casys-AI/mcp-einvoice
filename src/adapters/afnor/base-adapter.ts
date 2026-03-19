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
  InvoiceDetail,
  SearchInvoicesResult,
  SearchDirectoryFrResult,
  ListBusinessEntitiesResult,
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
import { NotSupportedError } from "../shared/errors.ts";

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
    const afnor = this.requireAfnor("emitInvoice");
    const syntax = req.filename.toLowerCase().endsWith(".pdf") ? "Factur-X" : "CII";
    return await afnor.submitFlow(
      req.file,
      { flowSyntax: syntax, name: req.filename, processingRule: "B2B" },
      "CustomerInvoice",
    );
  }

  async searchInvoices(filters: InvoiceSearchFilters): Promise<SearchInvoicesResult> {
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
      direction: (r.flowDirection === "In" ? "received" : "sent") as "received" | "sent",
      date: r.updatedAt ?? r.submittedAt,
    }));
    return { rows, count: rows.length };
  }

  async getInvoice(id: string): Promise<InvoiceDetail> {
    const afnor = this.requireAfnor("getInvoice");
    const { data, contentType } = await afnor.downloadFlow(id);
    if (contentType.includes("json")) {
      // deno-lint-ignore no-explicit-any
      const doc = JSON.parse(new TextDecoder().decode(data)) as any;
      return {
        id,
        invoiceNumber: doc.invoiceId ?? doc.invoiceNumber,
        status: doc.ackStatus ?? doc.status,
        direction: doc.flowDirection === "In" ? "received" : doc.flowDirection === "Out" ? "sent" : undefined,
        senderName: doc.seller?.name,
        receiverName: doc.buyer?.name,
        issueDate: doc.invoiceDate,
        currency: doc.currency ?? "EUR",
      };
    }
    return { id, status: "UNKNOWN" };
  }

  async downloadInvoice(id: string): Promise<DownloadResult> {
    const afnor = this.requireAfnor("downloadInvoice");
    return await afnor.downloadFlow(id);
  }

  // ─── Status (AFNOR: lifecycle flows) ───────────────────

  async sendStatus(req: SendStatusRequest): Promise<unknown> {
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
      { flowSyntax: "CDAR", name: `status-${req.invoiceId}.json`, processingRule: "B2B" },
      "CustomerInvoiceLC",
    );
  }

  async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
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

  async reportInvoiceTransaction(transaction: Record<string, unknown>): Promise<unknown> {
    const afnor = this.requireAfnor("reportInvoiceTransaction");
    const payload = new TextEncoder().encode(JSON.stringify(transaction));
    return await afnor.submitFlow(
      payload,
      { flowSyntax: "FRR", name: "report.json", processingRule: "B2C" },
      "UnitaryCustomerTransactionReport",
    );
  }

  async reportTransaction(businessEntityId: string, transaction: Record<string, unknown>): Promise<unknown> {
    const afnor = this.requireAfnor("reportTransaction");
    const payload = new TextEncoder().encode(JSON.stringify({ businessEntityId, ...transaction }));
    return await afnor.submitFlow(
      payload,
      { flowSyntax: "FRR", name: "report.json", processingRule: "B2C" },
      "AggregatedCustomerTransactionReport",
    );
  }

  // ─── Not covered by AFNOR — subclass must override or leave as stub ───

  async downloadReadable(_id: string): Promise<DownloadResult> {
    throw new NotSupportedError(this.name, "downloadReadable", "Override in subclass with native API.");
  }

  async getInvoiceFiles(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "getInvoiceFiles", "AFNOR flows are atomic. Override in subclass.");
  }

  async getAttachments(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "getAttachments", "Override in subclass with native API.");
  }

  async downloadFile(_fileId: string): Promise<DownloadResult> {
    throw new NotSupportedError(this.name, "downloadFile", "Override in subclass with native API.");
  }

  async markInvoiceSeen(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "markInvoiceSeen", "Not in AFNOR spec.");
  }

  async getUnseenInvoices(_pagination: PaginatedRequest): Promise<unknown> {
    throw new NotSupportedError(this.name, "getUnseenInvoices", "Not in AFNOR spec.");
  }

  async generateCII(_req: GenerateInvoiceRequest): Promise<string> {
    throw new NotSupportedError(this.name, "generateCII", "Override in subclass if PA has format conversion.");
  }

  async generateUBL(_req: GenerateInvoiceRequest): Promise<string> {
    throw new NotSupportedError(this.name, "generateUBL", "Override in subclass if PA has format conversion.");
  }

  async generateFacturX(_req: GenerateFacturXRequest): Promise<DownloadResult> {
    throw new NotSupportedError(this.name, "generateFacturX", "Override in subclass if PA has format conversion.");
  }

  // ─── Directory — not in AFNOR, subclass must override ─

  async searchDirectoryFr(_filters: DirectoryFrSearchFilters): Promise<SearchDirectoryFrResult> {
    throw new NotSupportedError(this.name, "searchDirectoryFr", "Override in subclass with native API.");
  }

  async searchDirectoryInt(_filters: DirectoryIntSearchFilters): Promise<unknown> {
    throw new NotSupportedError(this.name, "searchDirectoryInt", "Not in AFNOR spec. Override in subclass.");
  }

  async checkPeppolParticipant(_scheme: string, _value: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "checkPeppolParticipant", "Not in AFNOR spec.");
  }

  // ─── Status extras ─────────────────────────────────────

  async getUnseenStatuses(_pagination: PaginatedRequest): Promise<unknown> {
    throw new NotSupportedError(this.name, "getUnseenStatuses", "Not in AFNOR spec.");
  }

  async markStatusSeen(_statusId: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "markStatusSeen", "Not in AFNOR spec.");
  }

  // ─── Webhooks — not in AFNOR (yet) ────────────────────

  async listWebhooks(): Promise<unknown> {
    throw new NotSupportedError(this.name, "listWebhooks", "Not in AFNOR spec. Override in subclass.");
  }

  async getWebhook(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "getWebhook", "Not in AFNOR spec.");
  }

  async createWebhook(_req: CreateWebhookRequest): Promise<unknown> {
    throw new NotSupportedError(this.name, "createWebhook", "Not in AFNOR spec.");
  }

  async updateWebhook(_id: string, _req: UpdateWebhookRequest): Promise<unknown> {
    throw new NotSupportedError(this.name, "updateWebhook", "Not in AFNOR spec.");
  }

  async deleteWebhook(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "deleteWebhook", "Not in AFNOR spec.");
  }

  // ─── Operator Config — not in AFNOR ───────────────────

  async getCustomerId(): Promise<unknown> {
    throw new NotSupportedError(this.name, "getCustomerId", "Override in subclass with native API.");
  }

  async listBusinessEntities(): Promise<ListBusinessEntitiesResult> {
    throw new NotSupportedError(this.name, "listBusinessEntities", "Override in subclass with native API.");
  }

  async getBusinessEntity(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "getBusinessEntity", "Override in subclass with native API.");
  }

  async createLegalUnit(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "createLegalUnit", "Override in subclass with native API.");
  }

  async createOffice(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "createOffice", "Override in subclass with native API.");
  }

  async deleteBusinessEntity(_id: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "deleteBusinessEntity", "Override in subclass with native API.");
  }

  async configureBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "configureBusinessEntity", "Override in subclass with native API.");
  }

  async claimBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "claimBusinessEntity", "Override in subclass.");
  }

  async claimBusinessEntityByIdentifier(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "claimBusinessEntityByIdentifier", "Override in subclass.");
  }

  async enrollFrench(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "enrollFrench", "Override in subclass with native API.");
  }

  async enrollInternational(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "enrollInternational", "Override in subclass.");
  }

  async registerNetwork(_identifierId: string, _network: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "registerNetwork", "Override in subclass with native API.");
  }

  async registerNetworkByScheme(_scheme: string, _value: string, _network: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "registerNetworkByScheme", "Override in subclass.");
  }

  async unregisterNetwork(_directoryId: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "unregisterNetwork", "Override in subclass.");
  }

  async createIdentifier(_entityId: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "createIdentifier", "Override in subclass with native API.");
  }

  async createIdentifierByScheme(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(this.name, "createIdentifierByScheme", "Override in subclass.");
  }

  async deleteIdentifier(_identifierId: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "deleteIdentifier", "Override in subclass.");
  }

  async deleteClaim(_entityId: string): Promise<unknown> {
    throw new NotSupportedError(this.name, "deleteClaim", "Override in subclass.");
  }

  // ─── Helpers ───────────────────────────────────────────

  /** Get the AFNOR client or throw if not configured. */
  protected requireAfnor(method: string): AfnorClient {
    if (!this.afnor) {
      throw new Error(
        `[${this.name}] ${method}: AFNOR API not configured. ` +
        `Override this method with native implementation.`,
      );
    }
    return this.afnor;
  }
}
