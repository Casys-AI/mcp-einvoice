/**
 * Storecove REST API Client
 *
 * Zero-dependency HTTP client for the Storecove e-invoicing API.
 * Auth: Bearer API key (no OAuth2 flow needed).
 *
 * API base: https://api.storecove.com/api/v2 (production & sandbox)
 *
 * @module lib/einvoice/src/adapters/storecove/client
 */

// ─── Client Config ─────────────────────────────────────

export interface StorecoveClientConfig {
  /** Storecove API base URL, e.g. https://api.storecove.com/api/v2 */
  baseUrl: string;
  /** Storecove API key (Bearer token) */
  apiKey: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * Error thrown when a Storecove API request fails.
 */
export class StorecoveAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "StorecoveAPIError";
  }
}

/**
 * Storecove REST API client.
 *
 * All methods map directly to Storecove API endpoints.
 * No hidden heuristics, no silent fallbacks.
 */
export class StorecoveClient {
  private config: StorecoveClientConfig;

  constructor(config: StorecoveClientConfig) {
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
    const url = new URL(`${this.config.baseUrl}${path}`);

    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
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
        throw new StorecoveAPIError(
          `[StorecoveClient] ${method} ${path} → ${response.status}: ${body.slice(0, 500)}`,
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

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * Download a binary resource (original invoice document, etc.)
   */
  async download(path: string): Promise<{ data: Uint8Array; contentType: string }> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new StorecoveAPIError(
          `[StorecoveClient] GET ${path} → ${response.status}`,
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
