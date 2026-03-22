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

import { BaseAdapter } from "../base-adapter.ts";
import type {
  AdapterMethodName,
  InvoiceDetail,
  InvoiceDirection,
  InvoiceSearchRow,
  SearchInvoicesResult,
  SearchDirectoryFrResult,
  DirectoryFrRow,
  ListBusinessEntitiesResult,
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
import { requireEnv } from "../shared/env.ts";
import { encodePathSegment } from "../shared/encoding.ts";
import { normalizeDirection } from "../shared/direction.ts";
import type { NormalizeFn } from "../shared/types.ts";
import { env } from "../../runtime.ts";

const IOPOLE_DEFAULT_AUTH_URL =
  "https://auth.iopole.com/realms/iopole/protocol/openid-connect/token";

/**
 * Iopole adapter for the EInvoice interface.
 *
 * Maps each EInvoiceAdapter method to the corresponding Iopole REST endpoint.
 * No hidden heuristics — direct pass-through to the Iopole API.
 */
export class IopoleAdapter extends BaseAdapter {
  readonly name = "iopole";
  readonly capabilities: Set<AdapterMethodName> = new Set<AdapterMethodName>([
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
    super();
    this.client = client;
  }

  // ─── Invoice Operations ───────────────────────────────

  override async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    return await this.client.upload("/invoice", req.file, req.filename);
  }

  override async searchInvoices(filters: InvoiceSearchFilters): Promise<SearchInvoicesResult> {
    // Map direction to Iopole API parameter
    const directionParam = filters.direction === "received" ? "RECEIVED"
      : filters.direction === "sent" ? "SENT" : undefined;

    // deno-lint-ignore no-explicit-any
    const raw = await this.client.getV11("/invoice/search", {
      q: filters.q,
      expand: filters.expand ?? "businessData",
      offset: filters.offset ?? 0,
      limit: filters.limit ?? 50,
      ...(directionParam ? { direction: directionParam } : {}),
    }) as any;

    const data = (raw.data ?? []) as Array<Record<string, unknown>>;
    const count = raw.meta?.count ?? raw.count ?? data.length;

    // Build normalized rows
    // deno-lint-ignore no-explicit-any
    const rows: InvoiceSearchRow[] = data.map((row: any) => {
      const m = row.metadata ?? {};
      const bd = row.businessData ?? {};
      return {
        id: m.invoiceId ?? "",
        invoiceNumber: bd.invoiceId,
        status: m.state, // will be enriched below
        direction: normalizeDirection(m.direction),
        senderName: bd.seller?.name,
        receiverName: bd.buyer?.name,
        date: bd.invoiceDate ?? m.createDate?.split("T")[0],
        amount: bd.monetary?.invoiceAmount?.amount,
        currency: bd.monetary?.invoiceCurrency ?? "EUR",
      };
    });

    // Enrich with lifecycle status — capped concurrency to avoid flooding the API
    const CONCURRENCY = 5;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (row) => {
        if (!row.id) return;
        try {
          const history = await this.getStatusHistory(row.id);
          if (history.entries.length > 0) {
            const sorted = [...history.entries].sort((a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            row.status = sorted[0].code;
          }
        } catch { /* keep row.status as fallback */ }
      }));
    }

    return { rows, count };
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    // Fetch invoice + status history in parallel (Iopole getInvoice has no state field)
    const [raw, history] = await Promise.all([
      this.client.get(`/invoice/${encodePathSegment(id)}`, { expand: "businessData" }),
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
    return await this.client.download(`/invoice/${encodePathSegment(id)}/download`);
  }

  override async downloadReadable(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/${encodePathSegment(id)}/download/readable`);
  }

  override async getInvoiceFiles(id: string): Promise<unknown> {
    return await this.client.get(`/invoice/${encodePathSegment(id)}/files`);
  }

  override async getAttachments(id: string): Promise<unknown> {
    return await this.client.get(`/invoice/${encodePathSegment(id)}/files/attachments`);
  }

  override async downloadFile(fileId: string): Promise<DownloadResult> {
    return await this.client.download(`/invoice/file/${encodePathSegment(fileId)}/download`);
  }

  override async markInvoiceSeen(id: string): Promise<unknown> {
    return await this.client.put(`/invoice/${encodePathSegment(id)}/markAsSeen`);
  }

  override async getUnseenInvoices(pagination: PaginatedRequest): Promise<unknown> {
    return await this.client.get("/invoice/notSeen", {
      offset: pagination.offset,
      limit: pagination.limit,
    });
  }

  override async generateCII(req: GenerateInvoiceRequest): Promise<string> {
    return await this.client.postWithQuery("/tools/cii/generate", normalizeForIopole(req.invoice), {
      flavor: req.flavor,
    });
  }

  override async generateUBL(req: GenerateInvoiceRequest): Promise<string> {
    return await this.client.postWithQuery("/tools/ubl/generate", normalizeForIopole(req.invoice), {
      flavor: req.flavor,
    });
  }

  override async generateFacturX(req: GenerateFacturXRequest): Promise<DownloadResult> {
    // Factur-X returns a PDF (binary) — use postBinary to avoid text corruption
    return await this.client.postBinary("/tools/facturx/generate", normalizeForIopole(req.invoice), {
      flavor: req.flavor,
      language: req.language,
    });
  }

  // ─── Directory ────────────────────────────────────────

  override async searchDirectoryFr(filters: DirectoryFrSearchFilters): Promise<SearchDirectoryFrResult> {
    const q = autoWrapDirectoryQuery(filters.q);
    // deno-lint-ignore no-explicit-any
    const raw = await this.client.get("/directory/french", {
      q,
      offset: filters.offset,
      limit: filters.limit,
    }) as any;
    const data = (raw.data ?? []) as Array<Record<string, unknown>>;
    const count = raw.meta?.count ?? raw.count ?? data.length;
    // deno-lint-ignore no-explicit-any
    const rows: DirectoryFrRow[] = data.map((row: any) => {
      const ci = row.countryIdentifier ?? {};
      return {
        entityId: row.businessEntityId ?? "",
        name: row.name,
        type: row.type,
        siren: ci.siren ?? row.siren,
        siret: ci.siret ?? row.siret,
        country: ci.country ?? row.country ?? "FR",
        identifiers: row.identifiers,
      };
    });
    return { rows, count };
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
      `/directory/international/check/scheme/${encodePathSegment(scheme)}/value/${
        encodePathSegment(value)
      }`,
    );
  }

  // ─── Status ───────────────────────────────────────────

  override async sendStatus(req: SendStatusRequest): Promise<unknown> {
    return await this.client.post(`/invoice/${encodePathSegment(req.invoiceId)}/status`, {
      code: req.code,
      message: req.message,
      payment: req.payment,
    });
  }

  override async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    const raw = await this.client.get(`/invoice/${encodePathSegment(invoiceId)}/status-history`);
    return normalizeStatusHistory(raw);
  }

  override async getUnseenStatuses(pagination: PaginatedRequest): Promise<unknown> {
    return await this.client.get("/invoice/status/notSeen", {
      offset: pagination.offset,
      limit: pagination.limit,
    });
  }

  override async markStatusSeen(statusId: string): Promise<unknown> {
    return await this.client.put(`/invoice/status/${encodePathSegment(statusId)}/markAsSeen`);
  }

  // ─── Reporting ────────────────────────────────────────

  override async reportInvoiceTransaction(transaction: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/reporting/fr/invoice/transaction", transaction);
  }

  override async reportTransaction(businessEntityId: string, transaction: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(
      `/reporting/fr/transaction/${encodePathSegment(businessEntityId)}`,
      transaction,
    );
  }

  // ─── Webhooks ─────────────────────────────────────────

  override async listWebhooks(): Promise<unknown> {
    return await this.client.get("/config/webhook");
  }

  override async getWebhook(id: string): Promise<unknown> {
    return await this.client.get(`/config/webhook/${encodePathSegment(id)}`);
  }

  override async createWebhook(req: CreateWebhookRequest): Promise<unknown> {
    return await this.client.post("/config/webhook", req);
  }

  override async updateWebhook(id: string, req: UpdateWebhookRequest): Promise<unknown> {
    return await this.client.put(`/config/webhook/${encodePathSegment(id)}`, req);
  }

  override async deleteWebhook(id: string): Promise<unknown> {
    return await this.client.delete(`/config/webhook/${encodePathSegment(id)}`);
  }

  // ─── Operator Config ───────────────────────────────────

  override async getCustomerId(): Promise<unknown> {
    return await this.client.get("/config/customer/id");
  }

  override async listBusinessEntities(): Promise<ListBusinessEntitiesResult> {
    // deno-lint-ignore no-explicit-any
    const raw = await this.client.get("/config/business/entity") as any;
    const data = (raw.data ?? []) as Array<Record<string, unknown>>;
    // deno-lint-ignore no-explicit-any
    const rows = data.map((row: any) => {
      const ci = row.countryIdentifier ?? {};
      return {
        entityId: row.businessEntityId ?? "",
        name: row.name,
        type: row.type,
        siren: ci.siren ?? row.siren,
        siret: ci.siret ?? row.siret,
        scope: row.scope,
        country: ci.country ?? row.country ?? "FR",
      };
    });
    return { rows, count: rows.length };
  }

  override async getBusinessEntity(id: string): Promise<unknown> {
    return await this.client.get(`/config/business/entity/${encodePathSegment(id)}`);
  }

  override async createLegalUnit(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/config/business/entity/legalunit", data);
  }

  override async createOffice(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/config/business/entity/office", data);
  }

  override async deleteBusinessEntity(id: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/${encodePathSegment(id)}`);
  }

  override async configureBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${encodePathSegment(id)}/configure`, data);
  }

  override async claimBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${encodePathSegment(id)}/claim`, data);
  }

  override async claimBusinessEntityByIdentifier(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(
      `/config/business/entity/scheme/${encodePathSegment(scheme)}/value/${
        encodePathSegment(value)
      }/claim`,
      data,
    );
  }

  override async enrollFrench(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.put("/config/french/enrollment", data);
  }

  override async enrollInternational(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.put("/config/international/enrollment", data);
  }

  override async registerNetwork(identifierId: string, network: string): Promise<unknown> {
    return await this.client.post(
      `/config/business/entity/identifier/${encodePathSegment(identifierId)}/network/${
        encodePathSegment(network)
      }`,
    );
  }

  override async registerNetworkByScheme(scheme: string, value: string, network: string): Promise<unknown> {
    return await this.client.post(
      `/config/business/entity/identifier/scheme/${encodePathSegment(scheme)}/value/${
        encodePathSegment(value)
      }/network/${encodePathSegment(network)}`,
    );
  }

  override async unregisterNetwork(directoryId: string): Promise<unknown> {
    return await this.client.delete(
      `/config/business/entity/identifier/directory/${encodePathSegment(directoryId)}`,
    );
  }

  // ─── Identifier Management ───────────────────────────────

  override async createIdentifier(entityId: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(`/config/business/entity/${encodePathSegment(entityId)}/identifier`, data);
  }

  override async createIdentifierByScheme(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post(
      `/config/business/entity/scheme/${encodePathSegment(scheme)}/value/${
        encodePathSegment(value)
      }/identifier`,
      data,
    );
  }

  override async deleteIdentifier(identifierId: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/identifier/${encodePathSegment(identifierId)}`);
  }

  // ─── Claim Management ────────────────────────────────────

  override async deleteClaim(entityId: string): Promise<unknown> {
    return await this.client.delete(`/config/business/entity/${encodePathSegment(entityId)}/claim`);
  }
}

// ─── Helpers ──────────────────────────────────────────

/**
 * Normalize invoice data for Iopole generate API.
 * Adds EN16931 required fields that LLMs often forget (postalAddress, electronicAddress).
 * Uses scheme 0225 (SIRET-based routing) for French PPF/PDP.
 */
// deno-lint-ignore no-explicit-any
const normalizeForIopole: NormalizeFn = (inv: any): Record<string, unknown> => {
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

  // Auto-generate electronicAddress from SIRET when absent
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

  // Auto-fill monetary fields now required by Iopole API
  if (normalized.monetary) {
    const m = { ...normalized.monetary };
    const currency = m.invoiceCurrency ?? "EUR";
    // payableAmount defaults to invoiceAmount
    if (!m.payableAmount) m.payableAmount = m.invoiceAmount;
    // taxTotalAmount.currency is now required
    if (m.taxTotalAmount && !m.taxTotalAmount.currency) {
      m.taxTotalAmount = { ...m.taxTotalAmount, currency };
    }
    normalized.monetary = m;
  }

  // Auto-fill lines[].taxDetail.categoryCode when absent (now required by Iopole API)
  if (Array.isArray(normalized.lines)) {
    normalized.lines = normalized.lines.map((line: any) => {
      if (line.taxDetail && !line.taxDetail.categoryCode) {
        return { ...line, taxDetail: { ...line.taxDetail, categoryCode: "S" } };
      }
      return line;
    });
  }

  return normalized;
};

/**
 * Auto-detect and wrap a raw directory search query into Iopole Lucene syntax.
 * 14 digits → siret, 9 digits → siren, FR+11 → vatNumber, 3+ chars → name wildcard.
 */
function autoWrapDirectoryQuery(q: string): string {
  const trimmed = q.trim();
  if (/^\d{14}$/.test(trimmed)) return `siret:"${trimmed}"`;
  if (/^\d{9}$/.test(trimmed)) return `siren:"${trimmed}"`;
  if (/^FR\d{11}$/i.test(trimmed)) return `vatNumber:"${trimmed.toUpperCase()}"`;
  if (trimmed.length >= 3 && !/^\d+$/.test(trimmed) && !trimmed.includes(":")) {
    return `name:"*${trimmed}*"`;
  }
  return trimmed;
}

// normalizeDirection imported from shared/direction.ts

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
export function createIopoleAdapter(): IopoleAdapter {
  const baseUrl = requireEnv("IopoleAdapter",
    "IOPOLE_API_URL",
    "Set it to https://api.ppd.iopole.fr/v1 (sandbox) or https://api.iopole.com/v1 (production).",
  );
  const clientId = requireEnv("IopoleAdapter",
    "IOPOLE_CLIENT_ID",
    "Get your client ID from the Iopole dashboard or admin console.",
  );
  const clientSecret = requireEnv("IopoleAdapter",
    "IOPOLE_CLIENT_SECRET",
    "Get your client secret from the Iopole dashboard or admin console.",
  );
  const customerId = requireEnv("IopoleAdapter",
    "IOPOLE_CUSTOMER_ID",
    "Find it in Settings → Unique Identifier (sandbox) or admin console.",
  );
  const authUrl = env("IOPOLE_AUTH_URL") || IOPOLE_DEFAULT_AUTH_URL;

  const getToken = createOAuth2TokenProvider({ authUrl, clientId, clientSecret });
  const client = new IopoleClient({ baseUrl, customerId, getToken });
  return new IopoleAdapter(client);
}
