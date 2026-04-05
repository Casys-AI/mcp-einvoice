/**
 * Base Adapter — default NotSupportedError stubs for all 43 methods.
 *
 * Any adapter (AFNOR-based or not) can extend this to only override
 * the methods it actually supports. Eliminates boilerplate in Storecove
 * and the test mock.
 *
 * AfnorBaseAdapter extends this and adds AFNOR-specific implementations.
 *
 * @module lib/einvoice/src/adapters/base-adapter
 */

import type {
  AdapterMethodName,
  CreateWebhookRequest,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  DownloadResult,
  EInvoiceAdapter,
  EmitInvoiceRequest,
  FileEntry,
  GenerateFacturXRequest,
  GenerateInvoiceRequest,
  InvoiceDetail,
  InvoiceSearchFilters,
  ListBusinessEntitiesResult,
  PaginatedRequest,
  SearchDirectoryFrResult,
  SearchDirectoryIntResult,
  SearchInvoicesResult,
  SendStatusRequest,
  StatusHistoryResult,
  UpdateWebhookRequest,
  WebhookDetail,
} from "../adapter.ts";
import { NotSupportedError } from "./shared/errors.ts";

/**
 * Abstract base adapter with default NotSupportedError for all methods.
 * Subclasses override only what they support.
 */
export abstract class BaseAdapter implements EInvoiceAdapter {
  abstract readonly name: string;
  abstract readonly capabilities: Set<AdapterMethodName>;

  protected notSupported(
    method: string,
    reason = "Not implemented by this adapter.",
  ): Promise<never> {
    return Promise.reject(new NotSupportedError(this.name, method, reason));
  }

  // ─── Invoice ───────────────────────────────────────────
  emitInvoice(_req: EmitInvoiceRequest): Promise<Record<string, unknown>> {
    return this.notSupported("emitInvoice");
  }
  searchInvoices(
    _filters: InvoiceSearchFilters,
  ): Promise<SearchInvoicesResult> {
    return this.notSupported("searchInvoices");
  }
  getInvoice(_id: string): Promise<InvoiceDetail> {
    return this.notSupported("getInvoice");
  }
  downloadInvoice(_id: string): Promise<DownloadResult> {
    return this.notSupported("downloadInvoice");
  }
  downloadReadable(_id: string): Promise<DownloadResult> {
    return this.notSupported("downloadReadable");
  }
  getInvoiceFiles(_id: string): Promise<FileEntry[]> {
    return this.notSupported("getInvoiceFiles");
  }
  getAttachments(_id: string): Promise<FileEntry[]> {
    return this.notSupported("getAttachments");
  }
  downloadFile(_fileId: string): Promise<DownloadResult> {
    return this.notSupported("downloadFile");
  }
  markInvoiceSeen(_id: string): Promise<Record<string, unknown>> {
    return this.notSupported("markInvoiceSeen");
  }
  getUnseenInvoices(_pagination: PaginatedRequest): Promise<Record<string, unknown>> {
    return this.notSupported("getUnseenInvoices");
  }
  generateCII(_req: GenerateInvoiceRequest): Promise<string> {
    return this.notSupported("generateCII");
  }
  generateUBL(_req: GenerateInvoiceRequest): Promise<string> {
    return this.notSupported("generateUBL");
  }
  generateFacturX(_req: GenerateFacturXRequest): Promise<DownloadResult> {
    return this.notSupported("generateFacturX");
  }

  // ─── Directory ────────────────────────────────────────
  searchDirectoryFr(
    _filters: DirectoryFrSearchFilters,
  ): Promise<SearchDirectoryFrResult> {
    return this.notSupported("searchDirectoryFr");
  }
  searchDirectoryInt(_filters: DirectoryIntSearchFilters): Promise<SearchDirectoryIntResult> {
    return this.notSupported("searchDirectoryInt");
  }
  checkPeppolParticipant(_scheme: string, _value: string): Promise<Record<string, unknown>> {
    return this.notSupported("checkPeppolParticipant");
  }

  // ─── Status ────────────────────────────────────────────
  sendStatus(_req: SendStatusRequest): Promise<Record<string, unknown>> {
    return this.notSupported("sendStatus");
  }
  getStatusHistory(_invoiceId: string): Promise<StatusHistoryResult> {
    return this.notSupported("getStatusHistory");
  }
  getUnseenStatuses(_pagination: PaginatedRequest): Promise<Record<string, unknown>> {
    return this.notSupported("getUnseenStatuses");
  }
  markStatusSeen(_statusId: string): Promise<Record<string, unknown>> {
    return this.notSupported("markStatusSeen");
  }

  // ─── Reporting ─────────────────────────────────────────
  reportInvoiceTransaction(
    _identifierScheme: string,
    _identifierValue: string,
    _transaction: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("reportInvoiceTransaction");
  }
  reportTransaction(
    _identifierScheme: string,
    _identifierValue: string,
    _transaction: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("reportTransaction");
  }

  // ─── Webhooks ──────────────────────────────────────────
  listWebhooks(): Promise<WebhookDetail[]> {
    return this.notSupported("listWebhooks");
  }
  getWebhook(_id: string): Promise<WebhookDetail> {
    return this.notSupported("getWebhook");
  }
  createWebhook(_req: CreateWebhookRequest): Promise<WebhookDetail> {
    return this.notSupported("createWebhook");
  }
  updateWebhook(_id: string, _req: UpdateWebhookRequest): Promise<WebhookDetail> {
    return this.notSupported("updateWebhook");
  }
  deleteWebhook(_id: string): Promise<Record<string, unknown>> {
    return this.notSupported("deleteWebhook");
  }

  // ─── Operator Config ───────────────────────────────────
  getCustomerId(): Promise<string> {
    return this.notSupported("getCustomerId");
  }
  listBusinessEntities(): Promise<ListBusinessEntitiesResult> {
    return this.notSupported("listBusinessEntities");
  }
  getBusinessEntity(_id: string): Promise<Record<string, unknown>> {
    return this.notSupported("getBusinessEntity");
  }
  createLegalUnit(_data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.notSupported("createLegalUnit");
  }
  createOffice(_data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.notSupported("createOffice");
  }
  deleteBusinessEntity(_id: string): Promise<Record<string, unknown>> {
    return this.notSupported("deleteBusinessEntity");
  }
  configureBusinessEntity(
    _id: string,
    _data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("configureBusinessEntity");
  }
  claimBusinessEntity(
    _id: string,
    _data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("claimBusinessEntity");
  }
  claimBusinessEntityByIdentifier(
    _scheme: string,
    _value: string,
    _data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("claimBusinessEntityByIdentifier");
  }
  enrollFrench(_data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.notSupported("enrollFrench");
  }
  enrollInternational(_data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.notSupported("enrollInternational");
  }
  registerNetwork(_identifierId: string, _network: string): Promise<Record<string, unknown>> {
    return this.notSupported("registerNetwork");
  }
  registerNetworkByScheme(
    _scheme: string,
    _value: string,
    _network: string,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("registerNetworkByScheme");
  }
  unregisterNetwork(_directoryId: string): Promise<Record<string, unknown>> {
    return this.notSupported("unregisterNetwork");
  }

  // ─── Identifier Management ─────────────────────────────
  createIdentifier(
    _entityId: string,
    _data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("createIdentifier");
  }
  createIdentifierByScheme(
    _scheme: string,
    _value: string,
    _data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.notSupported("createIdentifierByScheme");
  }
  deleteIdentifier(_identifierId: string): Promise<Record<string, unknown>> {
    return this.notSupported("deleteIdentifier");
  }

  // ─── Claim Management ──────────────────────────────────
  deleteClaim(_entityId: string): Promise<Record<string, unknown>> {
    return this.notSupported("deleteClaim");
  }
}
