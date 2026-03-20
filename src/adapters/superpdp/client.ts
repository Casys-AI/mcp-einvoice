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

import { BaseHttpClient } from "../shared/http-client.ts";

export interface SuperPDPClientConfig {
  /** Super PDP API base URL */
  baseUrl: string;
  /** Async function that returns a valid Bearer token */
  getToken: () => Promise<string>;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * Super PDP REST API client.
 * Extends BaseHttpClient — provides OAuth2 Bearer auth.
 */
export class SuperPDPClient extends BaseHttpClient {
  private getToken: () => Promise<string>;

  constructor(config: SuperPDPClientConfig) {
    super("SuperPDP", { baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
    this.getToken = config.getToken;
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
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
   * POST /invoices/convert with body + from/to query params.
   */
  async convert<T = unknown>(
    data: Uint8Array,
    from: string,
    to: string,
  ): Promise<T> {
    const contentType = from === "en16931" ? "application/json" : "application/xml";
    return this.request<T>("POST", "/invoices/convert", {
      body: data,
      contentType,
      query: { from, to },
    });
  }
}
