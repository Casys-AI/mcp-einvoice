/**
 * Iopole REST API Client
 *
 * Extends BaseHttpClient with Iopole-specific auth (Bearer + customer-id)
 * and custom methods (getV11, postBinary, upload, postWithQuery).
 *
 * API base: https://api.iopole.com/v1 (production)
 *           https://api.ppd.iopole.fr/v1 (sandbox)
 *
 * Auth:  OAuth2 client_credentials to Keycloak, token TTL = 10 min.
 *        Header `customer-id` required on all API requests (since 2026-02-01).
 *
 * @module lib/iopole/api/iopole-client
 */

import { BaseHttpClient } from "../shared/http-client.ts";
import type { BaseClientConfig } from "../shared/http-client.ts";
import { AdapterAPIError } from "../shared/errors.ts";

// Re-exported from shared module — used by Iopole and other OAuth2 adapters.
export { createOAuth2TokenProvider } from "../shared/oauth2.ts";
export type { OAuth2Config } from "../shared/oauth2.ts";

// ─── Client Config ─────────────────────────────────────

export interface IopoleClientConfig extends BaseClientConfig {
  /** Iopole customer-id header (required since 2026-02-01) */
  customerId: string;
  /** Async function that returns a valid Bearer token */
  getToken: () => Promise<string>;
}

/**
 * Iopole REST API client.
 *
 * All standard methods (get, post, put, delete, download) are inherited
 * from BaseHttpClient. Custom methods handle Iopole-specific needs:
 * - getV11: API version switching (v1 → v1.1)
 * - postBinary: PDF generation (returns Uint8Array, 60s timeout)
 * - upload: multipart file upload
 * - postWithQuery: POST with query params
 */
export class IopoleClient extends BaseHttpClient {
  private customerId: string;
  private getToken: () => Promise<string>;

  constructor(config: IopoleClientConfig) {
    super("Iopole", { baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
    this.customerId = config.customerId;
    this.getToken = config.getToken;
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      "customer-id": this.customerId,
    };
  }

  // ─── Custom Methods ────────────────────────────────────

  /**
   * GET request against the v1.1 API endpoint.
   * Uses requestWithBase() with a computed v1.1 URL — concurrent-safe,
   * no config mutation, full BaseHttpClient logic (auth, timeout, errors).
   */
  async getV11<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<T> {
    const baseV11 = this.config.baseUrl.replace(/\/v1\b/, "/v1.1");
    return this.requestWithBase<T>(baseV11, "GET", path, { query });
  }

  /**
   * POST with query parameters.
   * Used for /tools/{cii,ubl}/generate which return text (XML).
   */
  async postWithQuery<T = unknown>(
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<T> {
    return await this.request<T>("POST", path, { body, query });
  }

  /**
   * POST with query parameters, returning raw binary.
   * Used for /tools/facturx/generate which returns a PDF.
   * Uses 60s timeout (longer than the 30s default for PDF generation).
   */
  async postBinary(
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | undefined>,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const authHeaders = await this.getAuthHeaders();
    const url = new URL(`${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    // Longer default for binary generation (PDF can take 30-60s), but respect config override
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 60_000,
    );
    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new AdapterAPIError(
          "Iopole",
          `[Iopole] POST ${path} → ${response.status}: ${
            errBody.slice(0, 500)
          }`,
          response.status,
          errBody,
        );
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ??
        "application/octet-stream";
      return { data, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Upload a file via multipart/form-data.
   * Used for POST /invoice (emitInvoice).
   * Does NOT set Content-Type — fetch sets it with the multipart boundary.
   */
  async upload<T = unknown>(
    path: string,
    file: Uint8Array,
    filename: string,
  ): Promise<T> {
    const authHeaders = await this.getAuthHeaders();
    const url = `${this.config.baseUrl}${path}`;
    const form = new FormData();
    form.append("file", new Blob([file as BlobPart]), filename);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders,
          Accept: "application/json",
          // Do NOT set Content-Type — fetch sets it with the multipart boundary
        },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new AdapterAPIError(
          "Iopole",
          `[Iopole] POST ${path} (upload) → ${response.status}: ${
            errBody.slice(0, 500)
          }`,
          response.status,
          errBody,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }
      return (await response.text()) as unknown as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
