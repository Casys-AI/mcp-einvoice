/**
 * E-Invoice Adapter Interface
 *
 * PA-agnostic interface for French e-invoicing operations.
 * Each PA (Plateforme Agréée) implements this interface.
 * Currently implemented: Iopole (REST/JSON).
 *
 * The MCP tools call adapter methods, not PA-specific APIs.
 *
 * @module lib/einvoice/src/adapter
 */

// ─── Common Types ─────────────────────────────────────────

export interface DownloadResult {
  data: Uint8Array;
  contentType: string;
}

export interface PaginatedRequest {
  offset?: number;
  limit?: number;
}

// ─── Invoice Types ────────────────────────────────────────

export interface EmitInvoiceRequest {
  file: Uint8Array;
  filename: string;
}

export interface InvoiceSearchFilters extends PaginatedRequest {
  q?: string;
  expand?: string;
}

// ─── Directory Types ──────────────────────────────────────

export interface DirectoryFrSearchFilters extends PaginatedRequest {
  q: string;
}

export interface DirectoryIntSearchFilters extends PaginatedRequest {
  value: string;
}

// ─── Normalized Invoice Types ─────────────────────────────

/** Direction of an invoice, normalized across all PAs. */
export type InvoiceDirection = "received" | "sent";

/** A line item in an invoice. */
export interface InvoiceLineItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  taxRate?: number;
  amount?: number;
}

/**
 * Normalized invoice detail — PA-agnostic.
 * All fields optional (skeleton invoices may only have id + status + direction).
 */
export interface InvoiceDetail {
  id: string;
  invoiceNumber?: string;
  status?: string;
  direction?: InvoiceDirection;
  format?: string;
  network?: string;
  invoiceType?: string;
  senderName?: string;
  senderId?: string;
  senderVat?: string;
  receiverName?: string;
  receiverId?: string;
  receiverVat?: string;
  issueDate?: string;
  dueDate?: string;
  receiptDate?: string;
  currency?: string;
  totalHt?: number;
  totalTax?: number;
  totalTtc?: number;
  lines?: InvoiceLineItem[];
  notes?: string[];
}

// ─── Generate Types ──────────────────────────────────────

export interface GenerateInvoiceRequest {
  invoice: Record<string, unknown>;
  flavor: string;
}

export interface GenerateFacturXRequest extends GenerateInvoiceRequest {
  language?: string;
}

// ─── Status Types ─────────────────────────────────────────

/** A single entry in invoice status history. PA-agnostic. */
export interface StatusEntry {
  date: string;
  code: string;
  message?: string;
  destType?: string;
}

/** Normalized return type for getStatusHistory. */
export interface StatusHistoryResult {
  entries: StatusEntry[];
}

/**
 * Status codes — PA-specific (Iopole: IN_HAND, APPROVED, etc.;
 * SuperPDP: fr:212, etc.; Storecove: delivery evidence)
 */
export interface SendStatusRequest {
  invoiceId: string;
  code: string;
  message?: string;
  payment?: Record<string, unknown>;
}

// ─── Webhook Types ────────────────────────────────────────

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  name?: string;
  active?: boolean;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: string[];
  name?: string;
  active?: boolean;
}

/**
 * E-Invoice Adapter — PA-agnostic interface.
 *
 * Each method maps to a business operation, not a specific API endpoint.
 * PA adapters translate these calls to their concrete APIs.
 */
export interface EInvoiceAdapter {
  /** Adapter identifier (e.g. "iopole", "storecove") */
  readonly name: string;

  /** Set of adapter method names that this adapter actually supports.
   *  Used to filter MCP tools at registration time — unsupported tools
   *  are not exposed to the LLM, saving context tokens. */
  readonly capabilities: Set<string>;

  // ─── Invoice Operations ───────────────────────────────

  emitInvoice(req: EmitInvoiceRequest): Promise<unknown>;
  searchInvoices(filters: InvoiceSearchFilters): Promise<unknown>;
  getInvoice(id: string): Promise<InvoiceDetail>;
  downloadInvoice(id: string): Promise<DownloadResult>;
  downloadReadable(id: string): Promise<DownloadResult>;
  getInvoiceFiles(id: string): Promise<unknown>;
  getAttachments(id: string): Promise<unknown>;
  downloadFile(fileId: string): Promise<DownloadResult>;
  markInvoiceSeen(id: string): Promise<unknown>;
  getUnseenInvoices(pagination: PaginatedRequest): Promise<unknown>;
  generateCII(req: GenerateInvoiceRequest): Promise<string>;
  generateUBL(req: GenerateInvoiceRequest): Promise<string>;
  generateFacturX(req: GenerateFacturXRequest): Promise<DownloadResult>;

  // ─── Directory ────────────────────────────────────────

  searchDirectoryFr(filters: DirectoryFrSearchFilters): Promise<unknown>;
  searchDirectoryInt(filters: DirectoryIntSearchFilters): Promise<unknown>;
  checkPeppolParticipant(scheme: string, value: string): Promise<unknown>;

  // ─── Status ───────────────────────────────────────────

  sendStatus(req: SendStatusRequest): Promise<unknown>;
  getStatusHistory(invoiceId: string): Promise<StatusHistoryResult>;
  getUnseenStatuses(pagination: PaginatedRequest): Promise<unknown>;
  markStatusSeen(statusId: string): Promise<unknown>;

  // ─── Reporting ────────────────────────────────────────

  reportInvoiceTransaction(transaction: Record<string, unknown>): Promise<unknown>;
  reportTransaction(businessEntityId: string, transaction: Record<string, unknown>): Promise<unknown>;

  // ─── Webhooks ─────────────────────────────────────────

  listWebhooks(): Promise<unknown>;
  getWebhook(id: string): Promise<unknown>;
  createWebhook(req: CreateWebhookRequest): Promise<unknown>;
  updateWebhook(id: string, req: UpdateWebhookRequest): Promise<unknown>;
  deleteWebhook(id: string): Promise<unknown>;

  // ─── Operator Config ───────────────────────────────────

  getCustomerId(): Promise<unknown>;
  listBusinessEntities(): Promise<unknown>;
  getBusinessEntity(id: string): Promise<unknown>;
  createLegalUnit(data: Record<string, unknown>): Promise<unknown>;
  createOffice(data: Record<string, unknown>): Promise<unknown>;
  deleteBusinessEntity(id: string): Promise<unknown>;
  configureBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown>;
  claimBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown>;
  claimBusinessEntityByIdentifier(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown>;
  enrollFrench(data: Record<string, unknown>): Promise<unknown>;
  enrollInternational(data: Record<string, unknown>): Promise<unknown>;
  registerNetwork(identifierId: string, network: string): Promise<unknown>;
  registerNetworkByScheme(scheme: string, value: string, network: string): Promise<unknown>;
  unregisterNetwork(directoryId: string): Promise<unknown>;

  // ─── Identifier Management ──────────────────────────────

  createIdentifier(entityId: string, data: Record<string, unknown>): Promise<unknown>;
  createIdentifierByScheme(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown>;
  deleteIdentifier(identifierId: string): Promise<unknown>;

  // ─── Claim Management ──────────────────────────────────

  deleteClaim(entityId: string): Promise<unknown>;
}
