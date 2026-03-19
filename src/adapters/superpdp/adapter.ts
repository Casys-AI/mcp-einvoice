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
  StatusHistoryResult,
  DownloadResult,
  EmitInvoiceRequest,
  InvoiceSearchFilters,
  DirectoryFrSearchFilters,
  SendStatusRequest,
  GenerateInvoiceRequest,
  GenerateFacturXRequest,
} from "../../adapter.ts";
import { SuperPDPClient } from "./client.ts";
import { createOAuth2TokenProvider } from "../shared/oauth2.ts";
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

  readonly capabilities = new Set([
    // Native overrides
    "emitInvoice", "searchInvoices", "getInvoice", "downloadInvoice",
    "generateCII", "generateUBL", "generateFacturX",
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

  override async searchInvoices(filters: InvoiceSearchFilters): Promise<unknown> {
    return await this.client.get("/invoices", {
      direction: filters.q,  // Super PDP uses direction param, not Lucene
      limit: filters.limit,
      ...(filters.offset ? { starting_after_id: String(filters.offset) } : {}),
    });
  }

  override async getInvoice(id: string): Promise<unknown> {
    return await this.client.get(`/invoices/${id}`);
  }

  override async downloadInvoice(id: string): Promise<DownloadResult> {
    return await this.client.download(`/invoices/${id}/download`);
  }

  // ─── Format Conversion (native) ───────────────────────

  override async generateCII(req: GenerateInvoiceRequest): Promise<unknown> {
    const xmlPayload = new TextEncoder().encode(JSON.stringify(req.invoice));
    return await this.client.convert(xmlPayload, "json", "cii");
  }

  override async generateUBL(req: GenerateInvoiceRequest): Promise<unknown> {
    const xmlPayload = new TextEncoder().encode(JSON.stringify(req.invoice));
    return await this.client.convert(xmlPayload, "json", "ubl");
  }

  override async generateFacturX(req: GenerateFacturXRequest): Promise<unknown> {
    const xmlPayload = new TextEncoder().encode(JSON.stringify(req.invoice));
    return await this.client.convert(xmlPayload, "json", "facturx");
  }

  // ─── Status / Events (native) ─────────────────────────

  override async sendStatus(req: SendStatusRequest): Promise<unknown> {
    return await this.client.post("/invoice_events", {
      invoice_id: req.invoiceId,
      status_code: req.code,
      ...(req.message ? { message: req.message } : {}),
      ...(req.payment ? { payment: req.payment } : {}),
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

  override async searchDirectoryFr(_filters: DirectoryFrSearchFilters): Promise<unknown> {
    // Super PDP only lists own company's directory entries
    return await this.client.get("/directory_entries");
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

  override async registerNetwork(_identifierId: string, _network: string): Promise<unknown> {
    // In Super PDP, registration is implicit via directory entry creation
    return await this.client.post("/directory_entries", {
      identifier_id: _identifierId,
      network: _network,
    });
  }

  override async registerNetworkByScheme(scheme: string, value: string, _network: string): Promise<unknown> {
    return await this.client.post("/directory_entries", {
      scheme,
      value,
    });
  }

  override async unregisterNetwork(directoryId: string): Promise<unknown> {
    return await this.client.delete(`/directory_entries/${directoryId}`);
  }

  // ─── Identifier Management (native via directory) ─────

  override async createIdentifier(_entityId: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/directory_entries", data);
  }

  override async createIdentifierByScheme(_scheme: string, _value: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/directory_entries", data);
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

// ─── Factory ──────────────────────────────────────────

function requireEnv(name: string, hint: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`[SuperPDPAdapter] ${name} is required. ${hint}`);
  }
  return value;
}

/**
 * Create a SuperPDPAdapter from environment variables.
 *
 * Required: SUPERPDP_API_URL, SUPERPDP_CLIENT_ID, SUPERPDP_CLIENT_SECRET
 * Optional: SUPERPDP_AUTH_URL, SUPERPDP_AFNOR_URL
 */
export function createSuperPDPAdapter(): SuperPDPAdapter {
  const baseUrl = requireEnv(
    "SUPERPDP_API_URL",
    "Set it to https://api.superpdp.tech/v1.beta",
  );
  const clientId = requireEnv(
    "SUPERPDP_CLIENT_ID",
    "Get your client ID from the Super PDP dashboard.",
  );
  const clientSecret = requireEnv(
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
