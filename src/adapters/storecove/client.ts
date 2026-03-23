/**
 * Storecove REST API Client
 *
 * HTTP client for the Storecove e-invoicing API.
 * Auth: Bearer API key (no OAuth2 flow needed).
 *
 * API base: https://api.storecove.com/api/v2 (production & sandbox)
 *
 * @module lib/einvoice/src/adapters/storecove/client
 */

import { BaseHttpClient } from "../shared/http-client.ts";

export interface StorecoveClientConfig {
  /** Storecove API base URL */
  baseUrl: string;
  /** Storecove API key (Bearer token) */
  apiKey: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * Storecove REST API client.
 * Extends BaseHttpClient — only provides API key auth headers.
 */
export class StorecoveClient extends BaseHttpClient {
  private apiKey: string;

  constructor(config: StorecoveClientConfig) {
    super("Storecove", {
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.apiKey = config.apiKey;
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}
