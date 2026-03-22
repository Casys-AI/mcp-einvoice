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
  EInvoiceAdapter,
  AdapterMethodName,
  EmitInvoiceRequest,
  InvoiceSearchFilters,
  SearchInvoicesResult,
  InvoiceDetail,
  DownloadResult,
  PaginatedRequest,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  SearchDirectoryFrResult,
  StatusHistoryResult,
  SendStatusRequest,
  GenerateInvoiceRequest,
  GenerateFacturXRequest,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  ListBusinessEntitiesResult,
} from "../adapter.ts";
import { NotSupportedError } from "./shared/errors.ts";

/**
 * Abstract base adapter with default NotSupportedError for all methods.
 * Subclasses override only what they support.
 */
export abstract class BaseAdapter implements EInvoiceAdapter {
  abstract readonly name: string;
  abstract readonly capabilities: Set<AdapterMethodName>;

  protected notSupported(method: string, reason = "Not implemented by this adapter."): Promise<never> {
    return Promise.reject(new NotSupportedError(this.name, method, reason));
  }

  // ─── Invoice ───────────────────────────────────────────
  emitInvoice(_req: EmitInvoiceRequest): Promise<unknown> { return this.notSupported("emitInvoice"); }
  searchInvoices(_filters: InvoiceSearchFilters): Promise<SearchInvoicesResult> { return this.notSupported("searchInvoices"); }
  getInvoice(_id: string): Promise<InvoiceDetail> { return this.notSupported("getInvoice"); }
  downloadInvoice(_id: string): Promise<DownloadResult> { return this.notSupported("downloadInvoice"); }
  downloadReadable(_id: string): Promise<DownloadResult> { return this.notSupported("downloadReadable"); }
  getInvoiceFiles(_id: string): Promise<unknown> { return this.notSupported("getInvoiceFiles"); }
  getAttachments(_id: string): Promise<unknown> { return this.notSupported("getAttachments"); }
  downloadFile(_fileId: string): Promise<DownloadResult> { return this.notSupported("downloadFile"); }
  markInvoiceSeen(_id: string): Promise<unknown> { return this.notSupported("markInvoiceSeen"); }
  getUnseenInvoices(_pagination: PaginatedRequest): Promise<unknown> { return this.notSupported("getUnseenInvoices"); }
  generateCII(_req: GenerateInvoiceRequest): Promise<string> { return this.notSupported("generateCII"); }
  generateUBL(_req: GenerateInvoiceRequest): Promise<string> { return this.notSupported("generateUBL"); }
  generateFacturX(_req: GenerateFacturXRequest): Promise<DownloadResult> { return this.notSupported("generateFacturX"); }

  // ─── Directory ────────────────────────────────────────
  searchDirectoryFr(_filters: DirectoryFrSearchFilters): Promise<SearchDirectoryFrResult> { return this.notSupported("searchDirectoryFr"); }
  searchDirectoryInt(_filters: DirectoryIntSearchFilters): Promise<unknown> { return this.notSupported("searchDirectoryInt"); }
  checkPeppolParticipant(_scheme: string, _value: string): Promise<unknown> { return this.notSupported("checkPeppolParticipant"); }

  // ─── Status ────────────────────────────────────────────
  sendStatus(_req: SendStatusRequest): Promise<unknown> { return this.notSupported("sendStatus"); }
  getStatusHistory(_invoiceId: string): Promise<StatusHistoryResult> { return this.notSupported("getStatusHistory"); }
  getUnseenStatuses(_pagination: PaginatedRequest): Promise<unknown> { return this.notSupported("getUnseenStatuses"); }
  markStatusSeen(_statusId: string): Promise<unknown> { return this.notSupported("markStatusSeen"); }

  // ─── Reporting ─────────────────────────────────────────
  reportInvoiceTransaction(_transaction: Record<string, unknown>): Promise<unknown> { return this.notSupported("reportInvoiceTransaction"); }
  reportTransaction(_businessEntityId: string, _transaction: Record<string, unknown>): Promise<unknown> { return this.notSupported("reportTransaction"); }

  // ─── Webhooks ──────────────────────────────────────────
  listWebhooks(): Promise<unknown> { return this.notSupported("listWebhooks"); }
  getWebhook(_id: string): Promise<unknown> { return this.notSupported("getWebhook"); }
  createWebhook(_req: CreateWebhookRequest): Promise<unknown> { return this.notSupported("createWebhook"); }
  updateWebhook(_id: string, _req: UpdateWebhookRequest): Promise<unknown> { return this.notSupported("updateWebhook"); }
  deleteWebhook(_id: string): Promise<unknown> { return this.notSupported("deleteWebhook"); }

  // ─── Operator Config ───────────────────────────────────
  getCustomerId(): Promise<unknown> { return this.notSupported("getCustomerId"); }
  listBusinessEntities(): Promise<ListBusinessEntitiesResult> { return this.notSupported("listBusinessEntities"); }
  getBusinessEntity(_id: string): Promise<unknown> { return this.notSupported("getBusinessEntity"); }
  createLegalUnit(_data: Record<string, unknown>): Promise<unknown> { return this.notSupported("createLegalUnit"); }
  createOffice(_data: Record<string, unknown>): Promise<unknown> { return this.notSupported("createOffice"); }
  deleteBusinessEntity(_id: string): Promise<unknown> { return this.notSupported("deleteBusinessEntity"); }
  configureBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> { return this.notSupported("configureBusinessEntity"); }
  claimBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> { return this.notSupported("claimBusinessEntity"); }
  claimBusinessEntityByIdentifier(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> { return this.notSupported("claimBusinessEntityByIdentifier"); }
  enrollFrench(_data: Record<string, unknown>): Promise<unknown> { return this.notSupported("enrollFrench"); }
  enrollInternational(_data: Record<string, unknown>): Promise<unknown> { return this.notSupported("enrollInternational"); }
  registerNetwork(_identifierId: string, _network: string): Promise<unknown> { return this.notSupported("registerNetwork"); }
  registerNetworkByScheme(_scheme: string, _value: string, _network: string): Promise<unknown> { return this.notSupported("registerNetworkByScheme"); }
  unregisterNetwork(_directoryId: string): Promise<unknown> { return this.notSupported("unregisterNetwork"); }

  // ─── Identifier Management ─────────────────────────────
  createIdentifier(_entityId: string, _data: Record<string, unknown>): Promise<unknown> { return this.notSupported("createIdentifier"); }
  createIdentifierByScheme(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> { return this.notSupported("createIdentifierByScheme"); }
  deleteIdentifier(_identifierId: string): Promise<unknown> { return this.notSupported("deleteIdentifier"); }

  // ─── Claim Management ──────────────────────────────────
  deleteClaim(_entityId: string): Promise<unknown> { return this.notSupported("deleteClaim"); }
}
