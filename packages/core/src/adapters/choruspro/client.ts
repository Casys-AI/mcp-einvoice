/**
 * Chorus Pro HTTP Client
 *
 * Handles dual authentication:
 * 1. OAuth2 Bearer token via PISTE platform
 * 2. cpro-account header with base64-encoded Chorus Pro technical credentials
 *
 * All Chorus Pro endpoints are POST (except health-check), with responses
 * using `codeRetour: 0` for success instead of relying on HTTP status codes.
 *
 * @module adapters/choruspro/client
 */

import { BaseHttpClient } from "../shared/http-client.ts";
import type { BaseClientConfig } from "../shared/http-client.ts";

export interface ChorusProClientConfig extends BaseClientConfig {
  /** OAuth2 token getter (from PISTE platform). */
  getToken: () => Promise<string>;
  /** Chorus Pro technical account login (e.g. TECH_1_xxxxx@cpro.fr). */
  cproLogin: string;
  /** Chorus Pro technical account password. */
  cproPassword: string;
}

/**
 * Chorus Pro API response envelope.
 * All responses include codeRetour (0 = success) and a message.
 */
export interface ChorusProResponse {
  codeRetour: number;
  libelle?: string;
}

export class ChorusProClient extends BaseHttpClient {
  private getToken: () => Promise<string>;
  private cproAccountHeader: string;

  constructor(config: ChorusProClientConfig) {
    super("ChorusPro", {
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs ?? 30_000,
    });
    this.getToken = config.getToken;
    // Pre-compute the base64-encoded cpro-account header
    this.cproAccountHeader = btoa(`${config.cproLogin}:${config.cproPassword}`);
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      "Authorization": `Bearer ${token}`,
      "cpro-account": this.cproAccountHeader,
    };
  }

  /**
   * POST to a different base URL path prefix.
   * Chorus Pro uses multiple prefixes: /factures, /structures, /utilisateurs, /transverses.
   * Since BaseHttpClient appends path to baseUrl, we pass full sub-paths.
   */
  async postCpro<T extends ChorusProResponse>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return await this.post<T>(path, body ?? {});
  }
}
