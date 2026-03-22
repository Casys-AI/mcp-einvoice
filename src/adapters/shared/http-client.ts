/**
 * Base HTTP Client
 *
 * Shared HTTP client logic for all adapter clients.
 * Handles: URL construction, timeout, abort, error handling, JSON/text parsing.
 * Subclasses only provide auth headers via getAuthHeaders().
 *
 * @module lib/einvoice/src/adapters/shared/http-client
 */

import { AdapterAPIError } from "./errors.ts";

export interface BaseClientConfig {
  /** API base URL */
  baseUrl: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * Abstract base HTTP client.
 * Subclasses implement getAuthHeaders() to provide authentication.
 */
export abstract class BaseHttpClient {
  protected config: BaseClientConfig;
  private adapterName: string;

  constructor(adapterName: string, config: BaseClientConfig) {
    this.adapterName = adapterName;
    this.config = config;
  }

  /** Return auth headers for each request. */
  protected abstract getAuthHeaders(): Promise<Record<string, string>>;

  // ─── Generic Request ────────────────────────────────────

  async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | string[] | undefined>;
      headers?: Record<string, string>;
      contentType?: string;
    },
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${path}`);

    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, v);
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const authHeaders = await this.getAuthHeaders();
    const headers: Record<string, string> = {
      ...authHeaders,
      Accept: "application/json",
      ...options?.headers,
    };

    let bodyPayload: BodyInit | undefined;
    if (options?.body) {
      if (options.contentType && options.body instanceof Uint8Array) {
        headers["Content-Type"] = options.contentType;
        bodyPayload = options.body as unknown as BodyInit;
      } else {
        headers["Content-Type"] = options.contentType ?? "application/json";
        bodyPayload = JSON.stringify(options.body);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: bodyPayload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AdapterAPIError(
          this.adapterName,
          `[${this.adapterName}] ${method} ${path} → ${response.status}: ${body.slice(0, 500)}`,
          response.status,
          body,
        );
      }

      const ct = response.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        return (await response.json()) as T;
      }
      return (await response.text()) as unknown as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Convenience Methods ────────────────────────────────

  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * Download a binary resource. Returns raw bytes + content type.
   */
  async download(path: string): Promise<{ data: Uint8Array; contentType: string }> {
    const url = `${this.config.baseUrl}${path}`;
    const authHeaders = await this.getAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: authHeaders,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AdapterAPIError(
          this.adapterName,
          `[${this.adapterName}] GET ${path} → ${response.status}`,
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
}
