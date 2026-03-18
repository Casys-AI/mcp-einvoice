/**
 * Iopole Adapter
 *
 * Implements EInvoiceAdapter for the Iopole PA (Plateforme Agréée).
 * Wraps the IopoleClient HTTP client to translate adapter method calls
 * into Iopole REST API requests.
 *
 * Paths match the Iopole Swagger spec at https://api.ppd.iopole.fr/v1/api
 *
 * @module lib/einvoice/src/adapters/iopole
 */

import type {
  EInvoiceAdapter,
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
} from "../adapter.ts";
import { IopoleClient, createOAuth2TokenProvider } from "../api/iopole-client.ts";
import { env } from "../runtime.ts";

const IOPOLE_DEFAULT_AUTH_URL =
  "https://auth.iopole.com/realms/iopole/protocol/openid-connect/token";

/**
 * Iopole adapter for the EInvoice interface.
 *
 * Maps each EInvoiceAdapter method to the corresponding Iopole REST endpoint.
 * No hidden heuristics — direct pass-through to the Iopole API.
 */
export class IopoleAdapter implements EInvoiceAdapter {
  readonly name = "iopole";
  private client: IopoleClient;

  constructor(client: IopoleClient) {
    this.client = client;
  }

  // ─── Invoice Operations ───────────────────────────────

  async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    return await this.client.upload("/invoice", req.file, req.filename);
  }

  async searchInvoices(filters: InvoiceSearchFilters): Promise<unknown> {
    // Search endpoint is v1.1, not v1. We use getV11() to swap the version prefix.
    return await this.client.getV11("/invoice/search", {
      q: filters.q,
      expand: filters.expand,
      offset: filters.offset ?? 0,
      limit: filters.limit ?? 50,
    });
  }

  async getInvoice(id: string): Promise<unknown> {
    // Always expand businessData — without it Iopole returns a skeleton
    // with businessData: null (no seller, buyer, lines, monetary data).
    return await this.client.get(`/invoice/${id}`, { expand: "businessData" });
  }

  async downloadInvoice(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/${id}/download`);
  }

  async downloadReadable(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/${id}/download/readable`);
  }

  async getInvoiceFiles(id: string): Promise<unknown> {
    return await this.client.get(`/invoice/${id}/files`);
  }

  async getAttachments(id: string): Promise<unknown> {
    return await this.client.get(`/invoice/${id}/files/attachments`);
  }

  async downloadFile(fileId: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/file/${fileId}/download`);
  }

  async markInvoiceSeen(id: string): Promise<unknown> {
    return await this.client.put(`/invoice/${id}/markAsSeen`);
  }

  async getUnseenInvoices(pagination: PaginatedRequest): Promise<unknown> {
    return await this.client.get("/invoice/notSeen", {
      offset: pagination.offset,
      limit: pagination.limit,
    });
  }

  async generateCII(req: GenerateInvoiceRequest): Promise<unknown> {
    return await this.client.postWithQuery("/tools/cii/generate", req.invoice, {
      flavor: req.flavor,
    });
  }

  async generateUBL(req: GenerateInvoiceRequest): Promise<unknown> {
    return await this.client.postWithQuery("/tools/ubl/generate", req.invoice, {
      flavor: req.flavor,
    });
  }

  async generateFacturX(req: GenerateFacturXRequest): Promise<unknown> {
    return await this.client.postWithQuery("/tools/facturx/generate", req.invoice, {
      flavor: req.flavor,
      language: req.language,
    });
  }

  // ─── Directory ────────────────────────────────────────

  async searchDirectoryFr(filters: DirectoryFrSearchFilters): Promise<unknown> {
    return await this.client.get("/directory/french", {
      q: filters.q,
      offset: filters.offset,
      limit: filters.limit,
    });
  }

  async searchDirectoryInt(filters: DirectoryIntSearchFilters): Promise<unknown> {
    return await this.client.get("/directory/international", {
      value: filters.value,
      offset: filters.offset,
      limit: filters.limit,
    });
  }

  async checkPeppolParticipant(scheme: string, value: string): Promise<unknown> {
    return await this.client.get(
      `/directory/international/check/scheme/${scheme}/value/${value}`,
    );
  }

  // ─── Status ───────────────────────────────────────────

  async sendStatus(req: SendStatusRequest): Promise<unknown> {
    return await this.client.post(`/invoice/${req.invoiceId}/status`, {
      code: req.code,
      message: req.message,
      payment: req.payment,
    });
  }

  async getStatusHistory(invoiceId: string): Promise<unknown> {
    return await this.client.get(`/invoice/${invoiceId}/status-history`);
  }

  async getUnseenStatuses(pagination: PaginatedRequest): Promise<unknown> {
    return await this.client.get("/invoice/status/notSeen", {
      offset: pagination.offset,
      limit: pagination.limit,
    });
  }

  async markStatusSeen(statusId: string): Promise<unknown> {
    return await this.client.put(`/invoice/status/${statusId}/markAsSeen`);
  }

  // ─── Reporting ────────────────────────────────────────

  async reportInvoiceTransaction(transaction: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/reporting/fr/invoice/transaction", transaction);
  }

  async reportTransaction(businessEntityId: string, transaction: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/reporting/fr/transaction/${businessEntityId}`, transaction);
  }

  // ─── Webhooks ─────────────────────────────────────────

  async listWebhooks(): Promise<unknown> {
    return await this.client.get("/config/webhook");
  }

  async getWebhook(id: string): Promise<unknown> {
    return await this.client.get(`/config/webhook/${id}`);
  }

  async createWebhook(req: CreateWebhookRequest): Promise<unknown> {
    return await this.client.post("/config/webhook", req);
  }

  async updateWebhook(id: string, req: UpdateWebhookRequest): Promise<unknown> {
    return await this.client.put(`/config/webhook/${id}`, req);
  }

  async deleteWebhook(id: string): Promise<unknown> {
    return await this.client.delete(`/config/webhook/${id}`);
  }

  // ─── Operator Config ───────────────────────────────────

  async getCustomerId(): Promise<unknown> {
    return await this.client.get("/config/customer/id");
  }

  async listBusinessEntities(): Promise<unknown> {
    return await this.client.get("/config/business/entity");
  }

  async getBusinessEntity(id: string): Promise<unknown> {
    return await this.client.get(`/config/business/entity/${id}`);
  }

  async createLegalUnit(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/config/business/entity/legalunit", data);
  }

  async createOffice(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/config/business/entity/office", data);
  }

  async deleteBusinessEntity(id: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/${id}`);
  }

  async configureBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${id}/configure`, data);
  }

  async claimBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${id}/claim`, data);
  }

  async claimBusinessEntityByIdentifier(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/scheme/${scheme}/value/${value}/claim`, data);
  }

  async enrollFrench(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.put("/config/french/enrollment", data);
  }

  async enrollInternational(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.put("/config/international/enrollment", data);
  }
}

// ─── Factory ──────────────────────────────────────────

/**
 * Create an IopoleAdapter from environment variables.
 *
 * Required: IOPOLE_API_URL, IOPOLE_CLIENT_ID, IOPOLE_CLIENT_SECRET, IOPOLE_CUSTOMER_ID
 * Optional: IOPOLE_AUTH_URL (default: production Keycloak)
 */
export function createIopoleAdapter(): IopoleAdapter {
  const baseUrl = env("IOPOLE_API_URL");
  const clientId = env("IOPOLE_CLIENT_ID");
  const clientSecret = env("IOPOLE_CLIENT_SECRET");
  const customerId = env("IOPOLE_CUSTOMER_ID");
  const authUrl = env("IOPOLE_AUTH_URL") || IOPOLE_DEFAULT_AUTH_URL;

  if (!baseUrl) {
    throw new Error(
      "[IopoleAdapter] IOPOLE_API_URL is required. " +
        "Set it to https://api.ppd.iopole.fr/v1 (sandbox) or https://api.iopole.com/v1 (production).",
    );
  }
  if (!clientId) {
    throw new Error(
      "[IopoleAdapter] IOPOLE_CLIENT_ID is required. " +
        "Get your client ID from the Iopole dashboard or admin console.",
    );
  }
  if (!clientSecret) {
    throw new Error(
      "[IopoleAdapter] IOPOLE_CLIENT_SECRET is required. " +
        "Get your client secret from the Iopole dashboard or admin console.",
    );
  }
  if (!customerId) {
    throw new Error(
      "[IopoleAdapter] IOPOLE_CUSTOMER_ID is required (since 2026-02-01). " +
        "Find it in Settings → Unique Identifier (sandbox) or admin console.",
    );
  }

  const getToken = createOAuth2TokenProvider({ authUrl, clientId, clientSecret });
  const client = new IopoleClient({ baseUrl, customerId, getToken });
  return new IopoleAdapter(client);
}
