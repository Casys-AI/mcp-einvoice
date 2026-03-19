/**
 * Super PDP REST API Client
 *
 * HTTP client for the Super PDP native e-invoicing API.
 * Auth: OAuth2 client_credentials (shared token provider).
 *
 * API base: https://api.superpdp.tech/v1.beta
 *
 * @module lib/einvoice/src/adapters/superpdp/client
 */

// ─── Client Config ──────────────────────────────────────

export interface SuperPDPClientConfig {
  /** Super PDP API base URL, e.g. https://api.superpdp.tech/v1.beta */
  baseUrl: string;
  /** Async function that returns a valid Bearer token */
  getToken: () => Promise<string>;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * Error thrown when a Super PDP API request fails.
 */
export class SuperPDPAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "SuperPDPAPIError";
  }
}

/**
 * Super PDP REST API client.
 *
 * All methods map directly to Super PDP API endpoints.
 */
export class SuperPDPClient {
  private config: SuperPDPClientConfig;

  constructor(config: SuperPDPClientConfig) {
    this.config = config;
  }

  // ─── Generic Request ────────────────────────────────────

  async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
      contentType?: string;
    },
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${path}`);

    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const token = await this.config.getToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...options?.headers,
    };

    let bodyPayload: BodyInit | undefined;
    if (options?.body) {
      if (options.contentType === "application/xml" && options.body instanceof Uint8Array) {
        headers["Content-Type"] = "application/xml";
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
        throw new SuperPDPAPIError(
          `[SuperPDPClient] ${method} ${path} → ${response.status}: ${body.slice(0, 500)}`,
          response.status,
          body,
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

  // ─── Convenience Methods ────────────────────────────────

  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * Submit XML invoice content.
   * Super PDP accepts raw XML body for invoice creation.
   */
  async postXml<T = unknown>(
    path: string,
    xmlData: Uint8Array,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("POST", path, {
      body: xmlData,
      contentType: "application/xml",
      query,
    });
  }

  /**
   * Convert invoice format.
   * POST /invoices/convert with XML body + from/to query params.
   */
  async convert<T = unknown>(
    xmlData: Uint8Array,
    from: string,
    to: string,
  ): Promise<T> {
    return this.request<T>("POST", "/invoices/convert", {
      body: xmlData,
      contentType: "application/xml",
      query: { from, to },
    });
  }

  /**
   * Download a binary resource (invoice XML or PDF).
   */
  async download(path: string): Promise<{ data: Uint8Array; contentType: string }> {
    const url = `${this.config.baseUrl}${path}`;
    const token = await this.config.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new SuperPDPAPIError(
          `[SuperPDPClient] GET ${path} → ${response.status}`,
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
