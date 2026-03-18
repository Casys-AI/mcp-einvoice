/**
 * Iopole REST API Client
 *
 * Zero-dependency HTTP client for the Iopole e-invoicing API.
 * Supports OAuth2 client_credentials authentication with auto-refresh.
 *
 * API base: https://api.iopole.com/v1 (production)
 *           https://api.ppd.iopole.fr/v1 (sandbox)
 *
 * Auth:  POST client_credentials to Keycloak, token TTL = 10 min.
 *        Header `customer-id` required on all API requests (since 2026-02-01).
 *
 * @module lib/iopole/api/iopole-client
 */

// ─── OAuth2 Token Provider ─────────────────────────────

export interface OAuth2Config {
  /** Keycloak token endpoint */
  authUrl: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
}

/**
 * Creates a token provider that fetches and caches OAuth2 client_credentials tokens.
 * Auto-refreshes 60s before expiry. Deduplicates concurrent requests.
 */
export function createOAuth2TokenProvider(
  config: OAuth2Config,
): () => Promise<string> {
  let cachedToken: string | undefined;
  let expiresAt = 0;
  let inflight: Promise<string> | undefined;

  const REFRESH_MARGIN_MS = 60_000;

  async function fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await fetch(config.authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[IopoleOAuth2] Token request failed: ${response.status} — ${text.slice(0, 500)}`,
      );
    }

    const data = await response.json() as { access_token: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error(
        "[IopoleOAuth2] Token response missing access_token",
      );
    }

    cachedToken = data.access_token;
    expiresAt = Date.now() + ((data.expires_in ?? 600) * 1000) - REFRESH_MARGIN_MS;

    return cachedToken;
  }

  return async () => {
    if (cachedToken && Date.now() < expiresAt) {
      return cachedToken;
    }
    // Dedup concurrent token requests
    if (!inflight) {
      inflight = fetchToken().finally(() => { inflight = undefined; });
    }
    return inflight;
  };
}

// ─── Client Config ─────────────────────────────────────

export interface IopoleClientConfig {
  /** Iopole API base URL, e.g. https://api.ppd.iopole.fr/v1 */
  baseUrl: string;
  /** Iopole customer-id header (required since 2026-02-01) */
  customerId: string;
  /** Async function that returns a valid Bearer token */
  getToken: () => Promise<string>;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * Error thrown when an Iopole API request fails.
 */
export class IopoleAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "IopoleAPIError";
  }
}

/**
 * Iopole REST API client.
 *
 * All methods map directly to Iopole API endpoints.
 * No hidden heuristics, no silent fallbacks.
 */
export class IopoleClient {
  private config: IopoleClientConfig;

  constructor(config: IopoleClientConfig) {
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
    },
  ): Promise<T> {
    return this.requestWithBase<T>(this.config.baseUrl, method, path, options);
  }

  private async requestWithBase<T = unknown>(
    baseUrl: string,
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);

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
      "customer-id": this.config.customerId,
      Accept: "application/json",
      ...options?.headers,
    };

    if (options?.body) {
      headers["Content-Type"] = "application/json";
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
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new IopoleAPIError(
          `[IopoleClient] ${method} ${path} → ${response.status}: ${body.slice(0, 500)}`,
          response.status,
          body,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      // For binary responses (PDF downloads, etc.)
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

  /**
   * GET request against the v1.1 API endpoint.
   * Builds a v1.1 URL without mutating this.config.baseUrl,
   * so concurrent calls (e.g. getV11 + get) cannot interfere.
   */
  async getV11<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const baseV11 = this.config.baseUrl.replace(/\/v1\b/, "/v1.1");
    return this.requestWithBase<T>(baseV11, "GET", path, { query });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * Upload a file via multipart/form-data.
   * Used for POST /invoice (emitInvoice) — the Swagger spec requires
   * Content-Type: multipart/form-data with a `file` field (binary, PDF or XML).
   */
  async upload<T = unknown>(
    path: string,
    file: Uint8Array,
    filename: string,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const token = await this.config.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const form = new FormData();
      form.append("file", new Blob([file as BlobPart]), filename);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "customer-id": this.config.customerId,
          Accept: "application/json",
          // Do NOT set Content-Type — fetch sets it with the multipart boundary
        },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new IopoleAPIError(
          `[IopoleClient] POST ${path} (upload) → ${response.status}: ${body.slice(0, 500)}`,
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

  /**
   * POST with query parameters.
   * Used for /tools/{cii,ubl}/generate which return text (XML).
   */
  async postWithQuery<T = unknown>(
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }

  /**
   * POST with query parameters, returning raw binary.
   * Used for /tools/facturx/generate which returns a PDF (binary).
   * Using request() would corrupt binary data by treating it as text.
   */
  async postBinary(
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | undefined>,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const url = new URL(`${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const token = await this.config.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "customer-id": this.config.customerId,
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new IopoleAPIError(`[IopoleClient] POST ${path} → ${response.status}: ${errBody.slice(0, 500)}`, response.status, errBody);
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      return { data, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Download a binary resource (invoice PDF, attachment, etc.)
   * Returns the raw Response for streaming.
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
        headers: {
          Authorization: `Bearer ${token}`,
          "customer-id": this.config.customerId,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new IopoleAPIError(
          `[IopoleClient] GET ${path} → ${response.status}`,
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

