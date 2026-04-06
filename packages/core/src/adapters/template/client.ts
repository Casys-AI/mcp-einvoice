/**
 * Template HTTP Client
 *
 * INSTRUCTIONS: Copy this file to your adapter directory and rename.
 * Extend BaseHttpClient and implement getAuthHeaders().
 *
 * Choose your auth strategy:
 * - OAuth2: store getToken function, call it in getAuthHeaders()
 * - API key: store key, return as Bearer or custom header
 * - mTLS/custom: override request() entirely
 *
 * @module adapters/template/client
 */

import { BaseHttpClient } from "../shared/http-client.ts";
import type { BaseClientConfig } from "../shared/http-client.ts";

// ── Config ───────────────────────────────────────
// Add your adapter-specific config fields here.
// BaseClientConfig provides: baseUrl, timeoutMs?

export interface TemplateClientConfig extends BaseClientConfig {
  // OPTION A: OAuth2 (like Iopole, SuperPDP)
  // getToken: () => Promise<string>;

  // OPTION B: API key (like Storecove)
  // apiKey: string;

  // OPTION C: Custom auth
  // Add your fields here
}

export class TemplateClient extends BaseHttpClient {
  // Store your auth credentials here
  // private getToken: () => Promise<string>;

  constructor(config: TemplateClientConfig) {
    // First arg: adapter name (used in error messages)
    super("Template", {
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    // Store auth credentials
    // this.getToken = config.getToken;
  }

  /**
   * Return headers for every request. Called automatically by BaseHttpClient.
   *
   * OPTION A (OAuth2):
   *   const token = await this.getToken();
   *   return { Authorization: `Bearer ${token}` };
   *
   * OPTION B (API key):
   *   return { Authorization: `Bearer ${this.apiKey}` };
   *
   * OPTION C (Custom):
   *   return { "X-Custom-Auth": "..." };
   */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    // TODO: Implement your auth headers
    throw new Error("Not implemented: override getAuthHeaders()");
  }

  // ── Custom methods (optional) ──────────────────
  //
  // BaseHttpClient gives you: get(), post(), put(), patch(), delete(), download()
  //
  // Add custom methods only if your API needs something BaseHttpClient
  // doesn't provide. Examples from existing adapters:
  //
  // Iopole:   postBinary() for PDF generation (returns Uint8Array)
  //           upload() for multipart file upload
  //           getV11() for API version switching
  //
  // SuperPDP: postXml() for XML invoice format
  //           convert() for format conversion (CII ↔ UBL)
  //
  // AFNOR:    submitFlow() for multipart AFNOR flow submission
  //           downloadFlow() for binary flow download
  //
  // If your API uses standard REST with JSON, you don't need custom methods.
}
