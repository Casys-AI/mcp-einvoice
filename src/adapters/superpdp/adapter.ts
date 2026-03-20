/**
 * Super PDP Adapter
 *
 * Implements EInvoiceAdapter via AfnorBaseAdapter for Super PDP.
 * AFNOR socle (inherited) handles e-reporting.
 * Native API (overrides) handles invoices, events, directory, conversion.
 *
 * See README.md for the full EInvoiceAdapter → Super PDP mapping.
 *
 * @module lib/einvoice/src/adapters/superpdp
 */

import { AfnorBaseAdapter } from "../afnor/base-adapter.ts";
import { AfnorClient } from "../afnor/client.ts";
import type {
  AdapterMethodName,
  InvoiceDetail,
  SearchInvoicesResult,
  SearchDirectoryFrResult,
  StatusHistoryResult,
  DownloadResult,
  EmitInvoiceRequest,
  InvoiceSearchFilters,
  DirectoryFrSearchFilters,
  SendStatusRequest,
  GenerateInvoiceRequest,
} from "../../adapter.ts";
import { SuperPDPClient } from "./client.ts";
import { createOAuth2TokenProvider } from "../shared/oauth2.ts";
import { requireEnv } from "../shared/env.ts";
import { env } from "../../runtime.ts";

/**
 * Super PDP adapter — extends AfnorBaseAdapter.
 *
 * - reportInvoiceTransaction, reportTransaction → inherited from AFNOR base
 * - 20 methods → native Super PDP API overrides
 * - 21 methods → inherited NotSupportedError stubs
 */
export class SuperPDPAdapter extends AfnorBaseAdapter {
  readonly name = "superpdp";

  readonly capabilities = new Set<AdapterMethodName>([
    // Native overrides
    "emitInvoice", "searchInvoices", "getInvoice", "downloadInvoice",
    "generateCII", "generateUBL",
    "sendStatus", "getStatusHistory",
    "getCustomerId", "getBusinessEntity",
    "createOffice", "enrollFrench",
    "registerNetwork", "registerNetworkByScheme", "unregisterNetwork",
    "createIdentifier", "createIdentifierByScheme", "deleteIdentifier",
    "searchDirectoryFr",
    // Inherited from AFNOR base
    "reportInvoiceTransaction", "reportTransaction",
  ]);

  private client: SuperPDPClient;

  constructor(client: SuperPDPClient, afnor: AfnorClient) {
    super(afnor);
    this.client = client;
  }

  // ─── Invoice Operations (native) ──────────────────────

  override async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    return await this.client.postXml("/invoices", req.file, {
      external_id: req.filename,
    });
  }

  override async searchInvoices(filters: InvoiceSearchFilters): Promise<SearchInvoicesResult> {
    const direction = (filters.q === "in" || filters.q === "out") ? filters.q : undefined;
    // expand[] embedded in path (BaseHttpClient.get query only supports single values per key)
    // deno-lint-ignore no-explicit-any
    const raw = await this.client.get("/invoices?expand[]=en_invoice&expand[]=events", {
      ...(direction ? { direction } : {}),
      ...(filters.limit ? { limit: filters.limit } : {}),
      ...(filters.offset ? { starting_after_id: String(filters.offset) } : {}),
    }) as any;
    const data = Array.isArray(raw) ? raw : (raw?.data ?? []);
    // deno-lint-ignore no-explicit-any
    const rows = data.map((inv: any) => ({
      id: String(inv.id ?? ""),
      invoiceNumber: inv.en_invoice?.number ?? inv.external_id,
      status: lastEventCode(inv.events),
      direction: mapDirection(inv.direction) as "received" | "sent",
      senderName: inv.en_invoice?.seller?.name,
      receiverName: inv.en_invoice?.buyer?.name,
      date: inv.en_invoice?.issue_date,
      amount: inv.en_invoice?.totals?.amount_due_for_payment,
      currency: inv.en_invoice?.currency_code ?? "EUR",
    }));
    return { rows, count: raw?.count ?? rows.length };
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    // deno-lint-ignore no-explicit-any
    const inv = await this.client.get(`/invoices/${id}`) as any;
    const en = inv.en_invoice;
    return {
      id: String(inv.id ?? id),
      invoiceNumber: en?.number ?? inv.external_id,
      status: lastEventCode(inv.events),
      direction: mapDirection(inv.direction),
      senderName: en?.seller?.name,
      receiverName: en?.buyer?.name,
      issueDate: en?.issue_date,
      dueDate: en?.due_date,
      currency: en?.currency_code ?? "EUR",
      totalHt: en?.totals?.tax_exclusive_amount,
      totalTtc: en?.totals?.tax_inclusive_amount,
    };
  }

  override async downloadInvoice(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoices/${id}/download`);
  }

  // ─── Format Conversion (native) ───────────────────────

  override async generateCII(req: GenerateInvoiceRequest): Promise<string> {
    const payload = new TextEncoder().encode(JSON.stringify(req.invoice));
    return await this.client.convert(payload, "en16931", "cii");
  }

  override async generateUBL(req: GenerateInvoiceRequest): Promise<string> {
    const payload = new TextEncoder().encode(JSON.stringify(req.invoice));
    return await this.client.convert(payload, "en16931", "ubl");
  }

  // ─── Status / Events (native) ─────────────────────────

  override async sendStatus(req: SendStatusRequest): Promise<unknown> {
    // Spec: { invoice_id: integer, status_code, details?: invoice_event_detail[] }
    // invoice_event_detail = { reason?: string, amounts?: invoice_event_amount[] }
    const details: Record<string, unknown>[] = [];
    if (req.message) {
      details.push({ reason: req.message });
    }
    if (req.payment) {
      const amounts = Array.isArray(req.payment.amounts) ? req.payment.amounts : [req.payment];
      details.push({ amounts });
    }
    return await this.client.post("/invoice_events", {
      invoice_id: toInvoiceId(req.invoiceId),
      status_code: req.code,
      ...(details.length > 0 ? { details } : {}),
    });
  }

  override async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    // deno-lint-ignore no-explicit-any
    const raw = await this.client.get("/invoice_events", {
      invoice_id: invoiceId,
    }) as any;
    const data = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return {
      // deno-lint-ignore no-explicit-any
      entries: data.map((e: any) => ({
        date: e.created_at ?? e.date ?? "",
        code: e.status_code ?? e.code ?? "",
        message: e.message,
      })),
    };
  }

  // ─── Reporting (AFNOR — inherited) ────────────────────
  // reportInvoiceTransaction → AfnorBaseAdapter.submitFlow (FRR)
  // reportTransaction → AfnorBaseAdapter.submitFlow (FRR)

  // ─── Directory (native) ───────────────────────────────

  override async searchDirectoryFr(_filters: DirectoryFrSearchFilters): Promise<SearchDirectoryFrResult> {
    // deno-lint-ignore no-explicit-any
    const raw = await this.client.get("/directory_entries") as any;
    const data = Array.isArray(raw) ? raw : (raw?.data ?? []);
    // deno-lint-ignore no-explicit-any
    const rows = data.map((entry: any) => ({
      entityId: String(entry.id ?? ""),
      name: entry.company?.formal_name ?? entry.company?.trade_name ?? entry.name,
      siret: entry.identifier,
      country: entry.company?.country ?? "FR",
      directory: entry.directory,
      status: entry.status,
      createdAt: entry.created_at,
    }));
    return { rows, count: rows.length };
  }

  // ─── Operator Config (native) ─────────────────────────

  override async getCustomerId(): Promise<unknown> {
    return await this.client.get("/companies/me");
  }

  override async getBusinessEntity(_id: string): Promise<unknown> {
    // Super PDP has one company per token — id is ignored
    return await this.client.get("/companies/me");
  }

  override async createOffice(data: Record<string, unknown>): Promise<unknown> {
    // In Super PDP, creating an "office" maps to creating a directory entry
    return await this.client.post("/directory_entries", data);
  }

  override async enrollFrench(data: Record<string, unknown>): Promise<unknown> {
    // Enrolling = registering a directory entry (routing address)
    return await this.client.post("/directory_entries", data);
  }

  override async registerNetwork(identifierId: string, network: string): Promise<unknown> {
    // Spec: { directory: "peppol"|"ppf", identifier: "scheme:value" }
    return await this.client.post("/directory_entries", {
      directory: mapNetworkToDirectory(network),
      identifier: identifierId,
    });
  }

  override async registerNetworkByScheme(scheme: string, value: string, network: string): Promise<unknown> {
    return await this.client.post("/directory_entries", {
      directory: mapNetworkToDirectory(network),
      identifier: `${scheme}:${value}`,
    });
  }

  override async unregisterNetwork(directoryId: string): Promise<unknown> {
    return await this.client.delete(`/directory_entries/${directoryId}`);
  }

  // ─── Identifier Management (native via directory) ─────

  override async createIdentifier(_entityId: string, data: Record<string, unknown>): Promise<unknown> {
    // Spec: { directory: "peppol"|"ppf", identifier: "scheme:value" }
    return await this.client.post("/directory_entries", {
      directory: data.directory ?? "ppf",
      identifier: data.identifier,
    });
  }

  override async createIdentifierByScheme(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/directory_entries", {
      directory: data.directory ?? "ppf",
      identifier: `${scheme}:${value}`,
    });
  }

  override async deleteIdentifier(identifierId: string): Promise<unknown> {
    return await this.client.delete(`/directory_entries/${identifierId}`);
  }

  // ─── Stubs (21 methods — inherited from AfnorBaseAdapter) ─
  // downloadReadable, getInvoiceFiles, getAttachments, downloadFile,
  // markInvoiceSeen, getUnseenInvoices, getUnseenStatuses, markStatusSeen,
  // listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook,
  // listBusinessEntities, createLegalUnit, deleteBusinessEntity,
  // configureBusinessEntity, claimBusinessEntity, claimBusinessEntityByIdentifier,
  // enrollInternational, searchDirectoryInt, checkPeppolParticipant, deleteClaim
}

// ─── Helpers ─────────────────────────────────────────

/** Extract status_code from the last event in the array, or undefined. */
// deno-lint-ignore no-explicit-any
function lastEventCode(events: any[] | undefined): string | undefined {
  if (!events?.length) return undefined;
  return events[events.length - 1].status_code;
}

/** Map SuperPDP direction ("in"/"out") to adapter direction ("received"/"sent"). */
function mapDirection(dir: string | undefined): "received" | "sent" | undefined {
  if (dir === "in") return "received";
  if (dir === "out") return "sent";
  return undefined;
}

/** Map adapter network names to SuperPDP directory values. */
function mapNetworkToDirectory(network: string): "ppf" | "peppol" {
  if (network === "DOMESTIC_FR" || network === "ppf") return "ppf";
  if (network === "PEPPOL_INTERNATIONAL" || network === "peppol") return "peppol";
  throw new Error(
    `[SuperPDP] Unknown network "${network}". Supported: "DOMESTIC_FR"/"ppf", "PEPPOL_INTERNATIONAL"/"peppol".`,
  );
}

/** Parse invoiceId string to integer, fail-fast on non-numeric values. */
function toInvoiceId(id: string): number {
  const n = Number(id);
  if (!Number.isFinite(n)) {
    throw new Error(`[SuperPDP] invoice_id must be numeric, got "${id}".`);
  }
  return n;
}

// ─── Factory ──────────────────────────────────────────


/**
 * Create a SuperPDPAdapter from environment variables.
 *
 * Required: SUPERPDP_API_URL, SUPERPDP_CLIENT_ID, SUPERPDP_CLIENT_SECRET
 * Optional: SUPERPDP_AUTH_URL, SUPERPDP_AFNOR_URL
 */
export function createSuperPDPAdapter(): SuperPDPAdapter {
  const baseUrl = requireEnv("SuperPDPAdapter",
    "SUPERPDP_API_URL",
    "Set it to https://api.superpdp.tech/v1.beta",
  );
  const clientId = requireEnv("SuperPDPAdapter",
    "SUPERPDP_CLIENT_ID",
    "Get your client ID from the Super PDP dashboard.",
  );
  const clientSecret = requireEnv("SuperPDPAdapter",
    "SUPERPDP_CLIENT_SECRET",
    "Get your client secret from the Super PDP dashboard.",
  );
  const authUrl = env("SUPERPDP_AUTH_URL") || "https://api.superpdp.tech/oauth2/token";
  const afnorUrl = env("SUPERPDP_AFNOR_URL") || "https://api.superpdp.tech/afnor-flow";

  // Same OAuth2 token works for both native and AFNOR APIs
  const getToken = createOAuth2TokenProvider({ authUrl, clientId, clientSecret });

  const client = new SuperPDPClient({ baseUrl, getToken });
  const afnor = new AfnorClient({ baseUrl: afnorUrl, getToken });

  return new SuperPDPAdapter(client, afnor);
}
