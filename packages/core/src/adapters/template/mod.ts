/**
 * Template Adapter Module
 *
 * Factory function + re-exports.
 * Register this in packages/core/src/adapters/registry.ts to make it selectable.
 *
 * @module adapters/template
 */

export { TemplateAdapter } from "./adapter.ts";
export { TemplateClient } from "./client.ts";
export type { TemplateClientConfig } from "./client.ts";

import { TemplateAdapter } from "./adapter.ts";
import type { TemplateClientConfig } from "./client.ts";

/**
 * Create a configured TemplateAdapter instance.
 * Reads config from environment variables.
 *
 * Required env vars (example — adapt to your API):
 * - TEMPLATE_API_URL: API base URL
 * - TEMPLATE_CLIENT_ID: OAuth2 client ID
 * - TEMPLATE_CLIENT_SECRET: OAuth2 client secret
 *
 * If using API key instead:
 * - TEMPLATE_API_KEY: API key
 */
export function createTemplateAdapter(): TemplateAdapter {
  // Example with OAuth2:
  // import { createOAuth2TokenProvider } from "../shared/oauth2.ts";
  // import { requireEnv } from "../shared/env.ts";
  //
  // const getToken = createOAuth2TokenProvider({
  //   authUrl: requireEnv("TEMPLATE_AUTH_URL"),
  //   clientId: requireEnv("TEMPLATE_CLIENT_ID"),
  //   clientSecret: requireEnv("TEMPLATE_CLIENT_SECRET"),
  // });
  //
  // return new TemplateAdapter({
  //   baseUrl: requireEnv("TEMPLATE_API_URL"),
  //   getToken,
  // });

  throw new Error(
    "Template adapter is a scaffold — copy, rename, and configure for your API.",
  );
}
