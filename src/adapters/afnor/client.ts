/**
 * AFNOR Flow API Client (XP Z12-013)
 *
 * Shared HTTP client for the AFNOR interoperable e-invoicing API.
 * All French PA (Plateformes Agréées) must implement this API.
 * One client, any PA — just change the base URL.
 *
 * Spec: XP Z12-013 (published May 2025, version 1.2.0)
 * Endpoints: POST /flows, POST /flows/search, GET /flows/{flowId}
 *
 * @module lib/einvoice/src/adapters/afnor/client
 */

import { BaseHttpClient } from "../shared/http-client.ts";
import { AdapterAPIError } from "../shared/errors.ts";

// ─── Types ──────────────────────────────────────────────

export type FlowSyntax = "CII" | "UBL" | "Factur-X" | "CDAR" | "FRR";

export type FlowProfile = "Basic" | "CIUS" | "Extended-CTC-FR";

export type ProcessingRule =
  | "B2B" | "B2BInt" | "B2C" | "B2G" | "B2GInt"
  | "OutOfScope" | "B2GOutOfScope" | "ArchiveOnly" | "NotApplicable";

export type FlowType =
  | "CustomerInvoice" | "SupplierInvoice" | "StateInvoice"
  | "CustomerInvoiceLC" | "SupplierInvoiceLC"
  | "StateCustomerInvoiceLC" | "StateSupplierInvoiceLC"
  | "AggregatedCustomerTransactionReport" | "UnitaryCustomerTransactionReport"
  | "AggregatedCustomerPaymentReport" | "UnitaryCustomerPaymentReport"
  | "UnitarySupplierTransactionReport" | "MultiFlowReport";

export type FlowDirection = "In" | "Out";

export type FlowAckStatus = "Pending" | "Ok" | "Error";

export interface FlowInfo {
  flowSyntax?: FlowSyntax;
  flowProfile?: FlowProfile;
  processingRule?: ProcessingRule;
  name?: string;
  trackingId?: string;
  sha256?: string;
}

export interface FlowSearchFilters {
  flowType?: FlowType[];
  flowDirection?: FlowDirection[];
  processingRule?: ProcessingRule[];
  ackStatus?: FlowAckStatus;
  trackingId?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface FlowSearchResult {
  results: unknown[];
  limit?: number;
  filters?: FlowSearchFilters;
}

// ─── Client Config ──────────────────────────────────────

export interface AfnorClientConfig {
  /** AFNOR Flow API base URL (e.g. https://api.superpdp.tech/afnor-flow) */
  baseUrl: string;
  /** Async function that returns a valid Bearer token */
  getToken: () => Promise<string>;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * AFNOR Flow API client (XP Z12-013).
 *
 * Extends BaseHttpClient for standard request/download.
 * Adds AFNOR-specific methods: submitFlow (multipart), searchFlows, downloadFlow.
 */
export class AfnorClient extends BaseHttpClient {
  private getToken: () => Promise<string>;

  constructor(config: AfnorClientConfig) {
    super("AFNOR", { baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
    this.getToken = config.getToken;
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  // ─── AFNOR-Specific Methods ──────────────────────────

  /**
   * Submit a new flow (invoice, lifecycle event, or e-reporting).
   * POST /v1/flows — multipart: flowInfo (JSON) + file (binary).
   */
  async submitFlow(
    file: Uint8Array,
    flowInfo: FlowInfo,
  ): Promise<unknown> {
    const url = new URL(`${this.config.baseUrl}/v1/flows`);
    const authHeaders = await this.getAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const form = new FormData();
      form.append("flowInfo", JSON.stringify(flowInfo));
      form.append("file", new Blob([file as BlobPart]), flowInfo.name ?? "invoice.xml");

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { ...authHeaders, Accept: "application/json" },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AdapterAPIError(
          "AFNOR",
          `[AFNOR] POST /v1/flows → ${response.status}: ${body.slice(0, 500)}`,
          response.status,
          body,
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Search flows by criteria.
   * POST /v1/flows/search
   */
  async searchFlows(
    filters: FlowSearchFilters,
    limit?: number,
  ): Promise<FlowSearchResult> {
    return await this.request<FlowSearchResult>("POST", "/v1/flows/search", {
      body: {
        where: filters,
        ...(limit ? { limit } : {}),
      },
    });
  }

  /**
   * Download a flow file.
   * GET /v1/flows/{flowId}
   */
  async downloadFlow(
    flowId: string,
    docType?: string,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const query = docType ? { docType } : undefined;
    const url = `${this.config.baseUrl}/v1/flows/${flowId}`;
    const authHeaders = await this.getAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const fullUrl = new URL(url);
      if (query) {
        for (const [k, v] of Object.entries(query)) fullUrl.searchParams.set(k, v);
      }
      const response = await fetch(fullUrl.toString(), {
        method: "GET",
        headers: authHeaders,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AdapterAPIError(
          "AFNOR",
          `[AFNOR] GET /v1/flows/${flowId} → ${response.status}`,
          response.status,
          body,
        );
      }

      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      return { data, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Health check — GET /v1/healthcheck
   */
  async healthcheck(): Promise<boolean> {
    try {
      await this.request("GET", "/v1/healthcheck");
      return true;
    } catch {
      return false;
    }
  }
}
