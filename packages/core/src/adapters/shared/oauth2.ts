/**
 * OAuth2 Client Credentials Token Provider
 *
 * Shared utility for adapters that use OAuth2 client_credentials authentication.
 * Used by: Iopole, Super PDP, and any future PA with OAuth2.
 *
 * @module lib/einvoice/src/adapters/shared/oauth2
 */

export interface OAuth2Config {
  /** Token endpoint URL */
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
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[OAuth2] Token request failed: ${response.status} — ${
          text.slice(0, 500)
        }`,
      );
    }

    const data = await response.json() as {
      access_token: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      throw new Error("[OAuth2] Token response missing access_token");
    }

    cachedToken = data.access_token;
    expiresAt = Date.now() + ((data.expires_in ?? 600) * 1000) -
      REFRESH_MARGIN_MS;

    return cachedToken;
  }

  return async () => {
    if (cachedToken && Date.now() < expiresAt) {
      return cachedToken;
    }
    // Dedup concurrent token requests
    if (!inflight) {
      inflight = fetchToken().finally(() => {
        inflight = undefined;
      });
    }
    return inflight;
  };
}
