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

import { AfnorBaseAdapter } from "../afnor/base-adapter.ts";
import type {
  InvoiceDetail,
  InvoiceDirection,
  StatusHistoryResult,
  StatusEntry,
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
import { IopoleClient, createOAuth2TokenProvider } from "./client.ts";
import { env } from "../../runtime.ts";

const IOPOLE_DEFAULT_AUTH_URL =
  "https://auth.iopole.com/realms/iopole/protocol/openid-connect/token";

/**
 * Iopole adapter for the EInvoice interface.
 *
 * Maps each EInvoiceAdapter method to the corresponding Iopole REST endpoint.
 * No hidden heuristics — direct pass-through to the Iopole API.
 */
export class IopoleAdapter extends AfnorBaseAdapter {
  readonly name = "iopole";
  readonly capabilities = new Set([
    "emitInvoice", "searchInvoices", "getInvoice", "downloadInvoice",
    "downloadReadable", "getInvoiceFiles", "getAttachments", "downloadFile",
    "markInvoiceSeen", "getUnseenInvoices", "generateCII", "generateUBL", "generateFacturX",
    "searchDirectoryFr", "searchDirectoryInt", "checkPeppolParticipant",
    "sendStatus", "getStatusHistory", "getUnseenStatuses", "markStatusSeen",
    "reportInvoiceTransaction", "reportTransaction",
    "listWebhooks", "getWebhook", "createWebhook", "updateWebhook", "deleteWebhook",
    "getCustomerId", "listBusinessEntities", "getBusinessEntity",
    "createLegalUnit", "createOffice", "deleteBusinessEntity",
    "configureBusinessEntity", "claimBusinessEntity", "claimBusinessEntityByIdentifier",
    "enrollFrench", "enrollInternational", "registerNetwork", "registerNetworkByScheme",
    "unregisterNetwork", "createIdentifier", "createIdentifierByScheme", "deleteIdentifier",
    "deleteClaim",
  ]);
  private client: IopoleClient;

  constructor(client: IopoleClient) {
    super(null); // no AFNOR client — pure passe-plat to native API
    this.client = client;
  }

  // ─── Invoice Operations ───────────────────────────────

  override async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    return await this.client.upload("/invoice", req.file, req.filename);
  }

  override async searchInvoices(filters: InvoiceSearchFilters): Promise<unknown> {
    // Search endpoint is v1.1, not v1. We use getV11() to swap the version prefix.
    return await this.client.getV11("/invoice/search", {
      q: filters.q,
      expand: filters.expand,
      offset: filters.offset ?? 0,
      limit: filters.limit ?? 50,
    });
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    // Fetch invoice + status history in parallel (Iopole getInvoice has no state field)
    const [raw, history] = await Promise.all([
      this.client.get(`/invoice/${id}`, { expand: "businessData" }),
      this.getStatusHistory(id).catch(() => ({ entries: [] })),
    ]);
    // deno-lint-ignore no-explicit-any
    const inv = (Array.isArray(raw) ? raw[0] : raw) as any;
    const latestStatus = history.entries.length > 0
      ? [...history.entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].code
      : undefined;

    const bd = inv?.businessData;
    return {
      id: inv?.invoiceId ?? id,
      invoiceNumber: bd?.invoiceId,
      status: latestStatus ?? inv?.state ?? inv?.status ?? "UNKNOWN",
      direction: normalizeDirection(inv?.way ?? inv?.metadata?.direction),
      format: inv?.originalFormat,
      network: inv?.originalNetwork,
      invoiceType: bd?.detailedType?.value,
      senderName: bd?.seller?.name,
      senderId: bd?.seller?.siret ?? bd?.seller?.siren,
      senderVat: bd?.seller?.vatNumber,
      receiverName: bd?.buyer?.name,
      receiverId: bd?.buyer?.siret ?? bd?.buyer?.siren,
      receiverVat: bd?.buyer?.vatNumber,
      issueDate: bd?.invoiceDate,
      dueDate: bd?.invoiceDueDate,
      receiptDate: bd?.invoiceReceiptDate,
      currency: bd?.monetary?.invoiceCurrency ?? "EUR",
      totalHt: bd?.monetary?.taxBasisTotalAmount?.amount,
      totalTax: bd?.monetary?.taxTotalAmount?.amount,
      totalTtc: bd?.monetary?.invoiceAmount?.amount,
      lines: bd?.lines?.map((l: Record<string, unknown>) => {
        // deno-lint-ignore no-explicit-any
        const line = l as any;
        return {
          description: line.item?.name,
          quantity: line.billedQuantity?.quantity,
          unitPrice: line.price?.netAmount?.amount,
          taxRate: line.taxDetail?.percent,
          amount: line.totalAmount?.amount,
        };
      }),
      notes: bd?.notes?.map((n: Record<string, unknown>) => (n as { content?: string }).content).filter(Boolean),
    };
  }

  override async downloadInvoice(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/${id}/download`);
  }

  override async downloadReadable(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/${id}/download/readable`);
  }

  override async getInvoiceFiles(id: string): Promise<unknown> {
    return await this.client.get(`/invoice/${id}/files`);
  }

  override async getAttachments(id: string): Promise<unknown> {
    return await this.client.get(`/invoice/${id}/files/attachments`);
  }

  override async downloadFile(fileId: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/file/${fileId}/download`);
  }

  override async markInvoiceSeen(id: string): Promise<unknown> {
    return await this.client.put(`/invoice/${id}/markAsSeen`);
  }

  override async getUnseenInvoices(pagination: PaginatedRequest): Promise<unknown> {
    return await this.client.get("/invoice/notSeen", {
      offset: pagination.offset,
      limit: pagination.limit,
    });
  }

  override async generateCII(req: GenerateInvoiceRequest): Promise<string> {
    return await this.client.postWithQuery("/tools/cii/generate", req.invoice, {
      flavor: req.flavor,
    });
  }

  override async generateUBL(req: GenerateInvoiceRequest): Promise<string> {
    return await this.client.postWithQuery("/tools/ubl/generate", req.invoice, {
      flavor: req.flavor,
    });
  }

  override async generateFacturX(req: GenerateFacturXRequest): Promise<DownloadResult> {
    // Factur-X returns a PDF (binary) — use postBinary to avoid text corruption
    return await this.client.postBinary("/tools/facturx/generate", req.invoice, {
      flavor: req.flavor,
      language: req.language,
    });
  }

  // ─── Directory ────────────────────────────────────────

  override async searchDirectoryFr(filters: DirectoryFrSearchFilters): Promise<unknown> {
    return await this.client.get("/directory/french", {
      q: filters.q,
      offset: filters.offset,
      limit: filters.limit,
    });
  }

  override async searchDirectoryInt(filters: DirectoryIntSearchFilters): Promise<unknown> {
    return await this.client.get("/directory/international", {
      value: filters.value,
      offset: filters.offset,
      limit: filters.limit,
    });
  }

  override async checkPeppolParticipant(scheme: string, value: string): Promise<unknown> {
    return await this.client.get(
      `/directory/international/check/scheme/${scheme}/value/${value}`,
    );
  }

  // ─── Status ───────────────────────────────────────────

  override async sendStatus(req: SendStatusRequest): Promise<unknown> {
    return await this.client.post(`/invoice/${req.invoiceId}/status`, {
      code: req.code,
      message: req.message,
      payment: req.payment,
    });
  }

  override async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    const raw = await this.client.get(`/invoice/${invoiceId}/status-history`);
    return normalizeStatusHistory(raw);
  }

  override async getUnseenStatuses(pagination: PaginatedRequest): Promise<unknown> {
    return await this.client.get("/invoice/status/notSeen", {
      offset: pagination.offset,
      limit: pagination.limit,
    });
  }

  override async markStatusSeen(statusId: string): Promise<unknown> {
    return await this.client.put(`/invoice/status/${statusId}/markAsSeen`);
  }

  // ─── Reporting ────────────────────────────────────────

  override async reportInvoiceTransaction(transaction: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/reporting/fr/invoice/transaction", transaction);
  }

  override async reportTransaction(businessEntityId: string, transaction: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/reporting/fr/transaction/${businessEntityId}`, transaction);
  }

  // ─── Webhooks ─────────────────────────────────────────

  override async listWebhooks(): Promise<unknown> {
    return await this.client.get("/config/webhook");
  }

  override async getWebhook(id: string): Promise<unknown> {
    return await this.client.get(`/config/webhook/${id}`);
  }

  override async createWebhook(req: CreateWebhookRequest): Promise<unknown> {
    return await this.client.post("/config/webhook", req);
  }

  override async updateWebhook(id: string, req: UpdateWebhookRequest): Promise<unknown> {
    return await this.client.put(`/config/webhook/${id}`, req);
  }

  override async deleteWebhook(id: string): Promise<unknown> {
    return await this.client.delete(`/config/webhook/${id}`);
  }

  // ─── Operator Config ───────────────────────────────────

  override async getCustomerId(): Promise<unknown> {
    return await this.client.get("/config/customer/id");
  }

  override async listBusinessEntities(): Promise<unknown> {
    return await this.client.get("/config/business/entity");
  }

  override async getBusinessEntity(id: string): Promise<unknown> {
    return await this.client.get(`/config/business/entity/${id}`);
  }

  override async createLegalUnit(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/config/business/entity/legalunit", data);
  }

  override async createOffice(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/config/business/entity/office", data);
  }

  override async deleteBusinessEntity(id: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/${id}`);
  }

  override async configureBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${id}/configure`, data);
  }

  override async claimBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${id}/claim`, data);
  }

  override async claimBusinessEntityByIdentifier(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/scheme/${scheme}/value/${value}/claim`, data);
  }

  override async enrollFrench(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.put("/config/french/enrollment", data);
  }

  override async enrollInternational(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.put("/config/international/enrollment", data);
  }

  override async registerNetwork(identifierId: string, network: string): Promise<unknown> {
    return await this.client.post(`/config/business/entity/identifier/${identifierId}/network/${network}`);
  }

  override async registerNetworkByScheme(scheme: string, value: string, network: string): Promise<unknown> {
    return await this.client.post(`/config/business/entity/identifier/scheme/${scheme}/value/${value}/network/${network}`);
  }

  override async unregisterNetwork(directoryId: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/identifier/directory/${directoryId}`);
  }

  // ─── Identifier Management ───────────────────────────────

  override async createIdentifier(entityId: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${entityId}/identifier`, data);
  }

  override async createIdentifierByScheme(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/scheme/${scheme}/value/${value}/identifier`, data);
  }

  override async deleteIdentifier(identifierId: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/identifier/${identifierId}`);
  }

  // ─── Claim Management ────────────────────────────────────

  override async deleteClaim(entityId: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/${entityId}/claim`);
  }
}

// ─── Helpers ──────────────────────────────────────────

/** Map Iopole direction codes to normalized InvoiceDirection. */
function normalizeDirection(raw: string | undefined): InvoiceDirection | undefined {
  if (!raw) return undefined;
  if (raw === "RECEIVED" || raw === "INBOUND") return "received";
  if (raw === "SENT" || raw === "EMITTED" || raw === "OUTBOUND") return "sent";
  return raw.toLowerCase() as InvoiceDirection;
}

/** Normalize Iopole status history response (array, {data}, {entries}, {history}) into StatusHistoryResult. */
function normalizeStatusHistory(raw: unknown): StatusHistoryResult {
  // deno-lint-ignore no-explicit-any
  let entries: any[] = [];
  if (Array.isArray(raw)) {
    entries = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) entries = obj.data;
    else if (Array.isArray(obj.entries)) entries = obj.entries;
    else if (Array.isArray(obj.history)) entries = obj.history;
  }
  return {
    entries: entries.map((e): StatusEntry => ({
      date: e.date ?? e.createdAt ?? "",
      code: e.status?.code ?? e.code ?? e.statusCode ?? "",
      message: e.status?.message ?? e.message,
      destType: e.destType,
    })),
  };
}

// ─── Factory ──────────────────────────────────────────

/**
 * Create an IopoleAdapter from environment variables.
 *
 * Required: IOPOLE_API_URL, IOPOLE_CLIENT_ID, IOPOLE_CLIENT_SECRET, IOPOLE_CUSTOMER_ID
 * Optional: IOPOLE_AUTH_URL (default: production Keycloak)
 */
/** Require an env var to be set, or throw with a descriptive message. */
function requireEnv(name: string, hint: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`[IopoleAdapter] ${name} is required. ${hint}`);
  }
  return value;
}

export function createIopoleAdapter(): IopoleAdapter {
  const baseUrl = requireEnv(
    "IOPOLE_API_URL",
    "Set it to https://api.ppd.iopole.fr/v1 (sandbox) or https://api.iopole.com/v1 (production).",
  );
  const clientId = requireEnv(
    "IOPOLE_CLIENT_ID",
    "Get your client ID from the Iopole dashboard or admin console.",
  );
  const clientSecret = requireEnv(
    "IOPOLE_CLIENT_SECRET",
    "Get your client secret from the Iopole dashboard or admin console.",
  );
  const customerId = requireEnv(
    "IOPOLE_CUSTOMER_ID",
    "Find it in Settings → Unique Identifier (sandbox) or admin console.",
  );
  const authUrl = env("IOPOLE_AUTH_URL") || IOPOLE_DEFAULT_AUTH_URL;

  const getToken = createOAuth2TokenProvider({ authUrl, clientId, clientSecret });
  const client = new IopoleClient({ baseUrl, customerId, getToken });
  return new IopoleAdapter(client);
}
