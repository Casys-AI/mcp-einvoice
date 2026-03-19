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
  flowDirection?: FlowDirection;
  processingRule?: ProcessingRule[];
  ackStatus?: FlowAckStatus[];
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
 * Error thrown when an AFNOR API request fails.
 */
export class AfnorAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "AfnorAPIError";
  }
}

/**
 * AFNOR Flow API client (XP Z12-013).
 *
 * 3 endpoints — covers: invoice submission, flow search, flow download.
 * Shared across all French PA adapters that implement the AFNOR standard.
 */
export class AfnorClient {
  private config: AfnorClientConfig;

  constructor(config: AfnorClientConfig) {
    this.config = config;
  }

  // ─── Core Methods ────────────────────────────────────

  /**
   * Submit a new flow (invoice, lifecycle event, or e-reporting).
   * POST /v1/flows
   *
   * The file is sent as the request body with appropriate content-type.
   * Flow metadata is passed via the flowInfo parameter.
   */
  async submitFlow(
    file: Uint8Array,
    flowInfo: FlowInfo,
    flowType?: FlowType,
  ): Promise<unknown> {
    const url = new URL(`${this.config.baseUrl}/v1/flows`);
    const token = await this.config.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      // AFNOR spec uses multipart: flowInfo (JSON) + file (binary)
      const form = new FormData();
      form.append("flowInfo", JSON.stringify({
        ...flowInfo,
        ...(flowType ? { flowType } : {}),
      }));
      form.append("file", new Blob([file as BlobPart]), flowInfo.name ?? "invoice.xml");

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AfnorAPIError(
          `[AfnorClient] POST /v1/flows → ${response.status}: ${body.slice(0, 500)}`,
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
   *
   * Returns flows matching the provided filters (AND between criteria,
   * OR for criteria allowing lists). Pagination via updatedAfter.
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
   *
   * Returns the raw file (invoice XML/PDF, lifecycle CDAR, or e-reporting).
   */
  async downloadFlow(
    flowId: string,
    docType?: string,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const url = new URL(`${this.config.baseUrl}/v1/flows/${flowId}`);
    if (docType) url.searchParams.set("docType", docType);
    const token = await this.config.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AfnorAPIError(
          `[AfnorClient] GET /v1/flows/${flowId} → ${response.status}`,
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
   * Health check.
   * GET /v1/healthcheck
   */
  async healthcheck(): Promise<boolean> {
    try {
      await this.request("GET", "/v1/healthcheck");
      return true;
    } catch {
      return false;
    }
  }

  // ─── Generic Request ────────────────────────────────

  private async request<T = unknown>(
    method: string,
    path: string,
    options?: { body?: unknown },
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const token = await this.config.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (options?.body) headers["Content-Type"] = "application/json";

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AfnorAPIError(
          `[AfnorClient] ${method} ${path} → ${response.status}: ${body.slice(0, 500)}`,
          response.status,
          body,
        );
      }

      const ct = response.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) return (await response.json()) as T;
      return (await response.text()) as unknown as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
