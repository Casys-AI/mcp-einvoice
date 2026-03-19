/**
 * Storecove Adapter
 *
 * Implements EInvoiceAdapter for Storecove (Peppol Access Point).
 * Wraps the StorecoveClient HTTP client to translate adapter method calls
 * into Storecove REST API requests.
 *
 * See README.md for the full EInvoiceAdapter → Storecove mapping.
 *
 * @module lib/einvoice/src/adapters/storecove
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
import { StorecoveClient } from "./client.ts";
import { env } from "../../runtime.ts";

/**
 * Error for adapter methods that Storecove does not support.
 * Includes an explanation of the Storecove alternative.
 */
class NotSupportedError extends Error {
  constructor(method: string, alternative: string) {
    super(
      `[StorecoveAdapter] ${method} is not supported by Storecove. ${alternative}`,
    );
    this.name = "NotSupportedError";
  }
}

/**
 * Storecove adapter for the EInvoice interface.
 *
 * Maps each EInvoiceAdapter method to the corresponding Storecove REST endpoint.
 * Unsupported methods throw NotSupportedError with an explanation.
 */
export class StorecoveAdapter implements EInvoiceAdapter {
  readonly name = "storecove";

  /** Only methods with real Storecove API mappings. */
  readonly capabilities = new Set([
    // Invoice
    "emitInvoice", "getInvoice", "downloadInvoice",
    // Directory
    "searchDirectoryFr", "searchDirectoryInt", "checkPeppolParticipant",
    // Status
    "getStatusHistory",
    // Webhooks
    "listWebhooks", "deleteWebhook",
    // Config / Entities
    "getBusinessEntity", "createLegalUnit", "deleteBusinessEntity",
    "configureBusinessEntity",
    // Identifiers / Network
    "enrollInternational", "registerNetwork", "registerNetworkByScheme",
    "unregisterNetwork", "createIdentifier", "createIdentifierByScheme",
    "deleteIdentifier",
  ]);

  private client: StorecoveClient;
  /** Default legal entity ID for operations that need one. */
  private defaultLegalEntityId?: string;

  constructor(client: StorecoveClient, defaultLegalEntityId?: string) {
    this.client = client;
    this.defaultLegalEntityId = defaultLegalEntityId;
  }

  // ─── Invoice Operations ───────────────────────────────

  async emitInvoice(req: EmitInvoiceRequest): Promise<unknown> {
    // Storecove accepts JSON Pure, JSON Parsed, or JSON Enveloped.
    // For file upload (UBL/CII XML), use JSON Enveloped mode:
    // base64-encode the file and wrap it in the document_submission structure.
    const base64 = btoa(String.fromCharCode(...req.file));
    const isXml = req.filename.toLowerCase().endsWith(".xml");
    return await this.client.post("/document_submissions", {
      document: {
        document_type: "invoice",
        raw_document: base64,
        raw_document_content_type: isXml ? "application/xml" : "application/pdf",
      },
      ...(this.defaultLegalEntityId
        ? { legal_entity_id: Number(this.defaultLegalEntityId) }
        : {}),
    });
  }

  async searchInvoices(_filters: InvoiceSearchFilters): Promise<unknown> {
    throw new NotSupportedError(
      "searchInvoices",
      "Storecove delivers invoices via webhooks (push) or pull queue. " +
      "There is no search endpoint. Use webhook pull mode to retrieve pending documents.",
    );
  }

  async getInvoice(id: string): Promise<unknown> {
    return await this.client.get(`/received_documents/${id}/json`);
  }

  async downloadInvoice(id: string): Promise<DownloadResult> {
    return await this.client.download(`/received_documents/${id}/original`);
  }

  async downloadReadable(_id: string): Promise<DownloadResult> {
    throw new NotSupportedError(
      "downloadReadable",
      "Storecove does not generate readable PDFs. Use getInvoice for JSON or downloadInvoice for the original document.",
    );
  }

  async getInvoiceFiles(_id: string): Promise<unknown> {
    throw new NotSupportedError(
      "getInvoiceFiles",
      "Storecove documents are atomic — no separate files list. Use getInvoice or downloadInvoice.",
    );
  }

  async getAttachments(_id: string): Promise<unknown> {
    throw new NotSupportedError(
      "getAttachments",
      "Attachments are embedded in the Storecove document. Use getInvoice to access them.",
    );
  }

  async downloadFile(_fileId: string): Promise<DownloadResult> {
    throw new NotSupportedError(
      "downloadFile",
      "Storecove has no separate file download. Use downloadInvoice for the full document.",
    );
  }

  async markInvoiceSeen(_id: string): Promise<unknown> {
    throw new NotSupportedError(
      "markInvoiceSeen",
      "Storecove does not track seen/unseen state via API.",
    );
  }

  async getUnseenInvoices(_pagination: PaginatedRequest): Promise<unknown> {
    throw new NotSupportedError(
      "getUnseenInvoices",
      "Use Storecove webhook pull mode to poll for new documents.",
    );
  }

  async generateCII(_req: GenerateInvoiceRequest): Promise<unknown> {
    throw new NotSupportedError(
      "generateCII",
      "Storecove auto-generates the compliant format on submission. " +
      "Use emitInvoice with JSON Pure mode instead.",
    );
  }

  async generateUBL(_req: GenerateInvoiceRequest): Promise<unknown> {
    throw new NotSupportedError(
      "generateUBL",
      "Storecove auto-generates the compliant format on submission. " +
      "Use emitInvoice with JSON Pure mode instead.",
    );
  }

  async generateFacturX(_req: GenerateFacturXRequest): Promise<unknown> {
    throw new NotSupportedError(
      "generateFacturX",
      "Storecove auto-generates the compliant format on submission. " +
      "Use emitInvoice with JSON Pure mode instead.",
    );
  }

  // ─── Directory ────────────────────────────────────────

  async searchDirectoryFr(filters: DirectoryFrSearchFilters): Promise<unknown> {
    // Map French directory search to Storecove discovery
    // Attempt to detect SIRET/SIREN and map to appropriate Peppol scheme
    return await this.client.post("/discovery/exists", {
      identifier: filters.q,
    });
  }

  async searchDirectoryInt(filters: DirectoryIntSearchFilters): Promise<unknown> {
    return await this.client.post("/discovery/receives", {
      identifier: filters.value,
    });
  }

  async checkPeppolParticipant(scheme: string, value: string): Promise<unknown> {
    return await this.client.post("/discovery/exists", {
      identifier: { scheme, identifier: value },
    });
  }

  // ─── Status ───────────────────────────────────────────

  async sendStatus(_req: SendStatusRequest): Promise<unknown> {
    throw new NotSupportedError(
      "sendStatus",
      "Storecove status is managed by the receiving Access Point. " +
      "The sender receives delivery evidence via the evidence endpoint.",
    );
  }

  async getStatusHistory(invoiceId: string): Promise<StatusHistoryResult> {
    // Map to document submission evidence (proof of delivery)
    // deno-lint-ignore no-explicit-any
    const raw = await this.client.get(
      `/document_submissions/${invoiceId}/evidence/delivery`,
    ) as any;
    return {
      entries: raw ? [{
        date: raw.timestamp ?? raw.date ?? "",
        code: raw.status ?? "delivered",
        message: raw.description,
      }] : [],
    };
  }

  async getUnseenStatuses(_pagination: PaginatedRequest): Promise<unknown> {
    throw new NotSupportedError(
      "getUnseenStatuses",
      "Storecove delivers status changes via webhooks.",
    );
  }

  async markStatusSeen(_statusId: string): Promise<unknown> {
    throw new NotSupportedError(
      "markStatusSeen",
      "Storecove does not track seen/unseen status via API.",
    );
  }

  // ─── Reporting ────────────────────────────────────────

  async reportInvoiceTransaction(_transaction: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(
      "reportInvoiceTransaction",
      "Storecove handles tax reporting internally based on the destination country.",
    );
  }

  async reportTransaction(_businessEntityId: string, _transaction: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(
      "reportTransaction",
      "Storecove handles tax reporting internally based on the destination country.",
    );
  }

  // ─── Webhooks ─────────────────────────────────────────

  async listWebhooks(): Promise<unknown> {
    return await this.client.get("/webhook_instances/");
  }

  async getWebhook(_id: string): Promise<unknown> {
    // Storecove has no get-by-id — return the list and let the tool filter
    throw new NotSupportedError(
      "getWebhook",
      "Storecove has no get-by-id webhook endpoint. Use listWebhooks instead.",
    );
  }

  async createWebhook(_req: CreateWebhookRequest): Promise<unknown> {
    throw new NotSupportedError(
      "createWebhook",
      "Storecove webhooks are configured via the Storecove dashboard UI, not the API.",
    );
  }

  async updateWebhook(_id: string, _req: UpdateWebhookRequest): Promise<unknown> {
    throw new NotSupportedError(
      "updateWebhook",
      "Storecove webhooks are configured via the Storecove dashboard UI, not the API.",
    );
  }

  async deleteWebhook(id: string): Promise<unknown> {
    return await this.client.delete(`/webhook_instances/${id}`);
  }

  // ─── Operator Config ───────────────────────────────────

  async getCustomerId(): Promise<unknown> {
    throw new NotSupportedError(
      "getCustomerId",
      "Storecove uses API keys, not customer IDs. Your identity is implicit in the API key.",
    );
  }

  async listBusinessEntities(): Promise<unknown> {
    throw new NotSupportedError(
      "listBusinessEntities",
      "Storecove has no list-all endpoint for legal entities. " +
      "Track entity IDs locally after creation, or use getBusinessEntity with a known ID.",
    );
  }

  async getBusinessEntity(id: string): Promise<unknown> {
    return await this.client.get(`/legal_entities/${id}`);
  }

  async createLegalUnit(data: Record<string, unknown>): Promise<unknown> {
    return await this.client.post("/legal_entities", {
      party_name: data.name,
      line1: data.address ?? "",
      city: data.city ?? "",
      zip: data.zip ?? "",
      country: data.country ?? "FR",
      ...(data.siren ? { tax_registered: true } : {}),
    });
  }

  async createOffice(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(
      "createOffice",
      "Storecove has no office/establishment concept. Use createLegalUnit for all entities.",
    );
  }

  async deleteBusinessEntity(id: string): Promise<unknown> {
    return await this.client.delete(`/legal_entities/${id}`);
  }

  async configureBusinessEntity(id: string, data: Record<string, unknown>): Promise<unknown> {
    return await this.client.patch(`/legal_entities/${id}`, data);
  }

  async claimBusinessEntity(_id: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(
      "claimBusinessEntity",
      "Storecove has no entity claim workflow. Entities are created and owned directly.",
    );
  }

  async claimBusinessEntityByIdentifier(_scheme: string, _value: string, _data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(
      "claimBusinessEntityByIdentifier",
      "Storecove has no entity claim workflow. Entities are created and owned directly.",
    );
  }

  async enrollFrench(_data: Record<string, unknown>): Promise<unknown> {
    throw new NotSupportedError(
      "enrollFrench",
      "Use enrollInternational with Peppol identifiers for French entity registration on Storecove.",
    );
  }

  async enrollInternational(data: Record<string, unknown>): Promise<unknown> {
    // Map to Peppol identifier creation
    const legalEntityId = data.legalEntityId ?? this.defaultLegalEntityId;
    if (!legalEntityId) {
      throw new Error("[StorecoveAdapter] enrollInternational requires legalEntityId");
    }
    return await this.client.post(
      `/legal_entities/${legalEntityId}/peppol_identifiers`,
      {
        superscheme: data.superscheme ?? "iso6523-actorid-upis",
        scheme: data.scheme,
        identifier: data.identifier ?? data.value,
      },
    );
  }

  async registerNetwork(identifierId: string, _network: string): Promise<unknown> {
    // In Storecove, Peppol registration is done at identifier creation time.
    // This is a no-op if the identifier already exists.
    return { message: `Peppol identifier ${identifierId} is registered on creation in Storecove.` };
  }

  async registerNetworkByScheme(scheme: string, value: string, _network: string): Promise<unknown> {
    // Same as registerNetwork — Peppol identifiers are registered on creation
    return {
      message: `Peppol identifier ${scheme}:${value} is registered on creation in Storecove. ` +
        `Use enrollInternational to create the identifier.`,
    };
  }

  async unregisterNetwork(directoryId: string): Promise<unknown> {
    // directoryId maps to the Peppol identifier deletion path
    // Expected format: legalEntityId/superscheme/scheme/identifier
    const parts = directoryId.split("/");
    if (parts.length < 4) {
      throw new Error(
        "[StorecoveAdapter] unregisterNetwork expects directoryId as 'legalEntityId/superscheme/scheme/identifier'",
      );
    }
    const [legalEntityId, ...rest] = parts;
    return await this.client.delete(
      `/legal_entities/${legalEntityId}/peppol_identifiers/${rest.join("/")}`,
    );
  }

  // ─── Identifier Management ───────────────────────────────

  async createIdentifier(entityId: string, data: Record<string, unknown>): Promise<unknown> {
    // Route to Peppol identifiers or additional tax identifiers based on data
    if (data.scheme && String(data.scheme).startsWith("0")) {
      // Peppol scheme (ISO 6523)
      return await this.client.post(
        `/legal_entities/${entityId}/peppol_identifiers`,
        {
          superscheme: data.superscheme ?? "iso6523-actorid-upis",
          scheme: data.scheme,
          identifier: data.value,
        },
      );
    }
    // Tax identifier
    return await this.client.post(
      `/legal_entities/${entityId}/additional_tax_identifiers`,
      data,
    );
  }

  async createIdentifierByScheme(scheme: string, value: string, data: Record<string, unknown>): Promise<unknown> {
    // Need to resolve entity ID from scheme/value — Storecove doesn't support this directly
    // Use the data.legalEntityId if provided
    const entityId = data.legalEntityId as string;
    if (!entityId) {
      throw new Error(
        "[StorecoveAdapter] createIdentifierByScheme requires data.legalEntityId " +
        "(Storecove cannot look up entities by scheme/value)",
      );
    }
    return await this.createIdentifier(entityId, {
      ...data,
      scheme: data.newScheme ?? scheme,
      value: data.newValue ?? value,
    });
  }

  async deleteIdentifier(identifierId: string): Promise<unknown> {
    // identifierId could be a Peppol path or a tax identifier ID
    // If it contains '/', treat as Peppol identifier path
    if (identifierId.includes("/")) {
      return await this.client.delete(
        `/legal_entities/${identifierId}`,
      );
    }
    // Otherwise treat as additional tax identifier — need entity ID
    throw new Error(
      "[StorecoveAdapter] deleteIdentifier for tax identifiers requires the full path: " +
      "'legalEntityId/additional_tax_identifiers/identifierId'",
    );
  }

  // ─── Claim Management ────────────────────────────────────

  async deleteClaim(_entityId: string): Promise<unknown> {
    throw new NotSupportedError(
      "deleteClaim",
      "Storecove has no entity claim concept. Delete the entity directly with deleteBusinessEntity.",
    );
  }
}

// ─── Factory ──────────────────────────────────────────

/** Require an env var to be set, or throw with a descriptive message. */
function requireEnv(name: string, hint: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`[StorecoveAdapter] ${name} is required. ${hint}`);
  }
  return value;
}

/**
 * Create a StorecoveAdapter from environment variables.
 *
 * Required: STORECOVE_API_URL, STORECOVE_API_KEY
 * Optional: STORECOVE_LEGAL_ENTITY_ID (default legal entity for submissions)
 */
export function createStorecoveAdapter(): StorecoveAdapter {
  const baseUrl = requireEnv(
    "STORECOVE_API_URL",
    "Set it to https://api.storecove.com/api/v2 (production/sandbox).",
  );
  const apiKey = requireEnv(
    "STORECOVE_API_KEY",
    "Get your API key from the Storecove dashboard.",
  );
  const defaultLegalEntityId = env("STORECOVE_LEGAL_ENTITY_ID") || undefined;

  const client = new StorecoveClient({ baseUrl, apiKey });
  return new StorecoveAdapter(client, defaultLegalEntityId);
}
