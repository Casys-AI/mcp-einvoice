/**
 * Reusable viewer registration for external consumers.
 *
 * The standalone `server.ts` and multi-tenant hosts (einvoice-platform)
 * both need to register the same set of MCP App viewers. This module
 * captures `import.meta.url` at the package level so that
 * `resolveViewerDistPath` resolves `./src/ui/dist/{viewer}/index.html`
 * relative to this package — not relative to the caller.
 *
 * @module src/viewers
 */

import type { McpApp } from "@casys/mcp-server";

/**
 * Captured once at import time — anchors dist resolution to the package root.
 * This file lives in `src/`, but `resolveViewerDistPath` expects the URL to
 * point at the package root (so `./src/ui/dist/{viewer}/index.html` resolves
 * correctly). Going up one level from `src/viewers.ts` → package root.
 */
const MODULE_URL = new URL("..", import.meta.url).href;

/** All viewers shipped with mcp-einvoice. */
const EINVOICE_VIEWERS = [
  "invoice-viewer",
  "doclist-viewer",
  "status-timeline",
  "directory-card",
  "directory-list",
  "action-result",
] as const;

export type EInvoiceViewerName = (typeof EINVOICE_VIEWERS)[number];

/** One-shot cache for HTTPS-fetched viewer HTML. Keyed by URL. */
const viewerHtmlCache = new Map<string, string>();

function isRemoteUrl(path: string): boolean {
  return path.startsWith("https://") || path.startsWith("http://");
}

/**
 * Register all e-invoice MCP App viewers on the given `McpApp`.
 *
 * Returns the `registerViewers` summary (registered / skipped lists).
 * Viewers whose dist is missing are skipped with a warning, not an error.
 */
export function registerEInvoiceViewers(
  app: McpApp,
): { registered: string[]; skipped: string[] } {
  return app.registerViewers({
    prefix: "mcp-einvoice",
    moduleUrl: MODULE_URL,
    viewers: [...EINVOICE_VIEWERS],
    exists: (path: string): boolean => {
      if (isRemoteUrl(path)) {
        return true; // JSR CDN — files guaranteed present via publish.include
      }
      try {
        Deno.statSync(path);
        return true;
      } catch {
        return false;
      }
    },
    readFile: async (path: string): Promise<string> => {
      if (isRemoteUrl(path)) {
        const cached = viewerHtmlCache.get(path);
        if (cached) return cached;
        const r = await fetch(path);
        if (!r.ok) {
          throw new Error(
            `Failed to fetch viewer HTML: ${path} (${r.status})`,
          );
        }
        const html = await r.text();
        viewerHtmlCache.set(path, html);
        return html;
      }
      return Deno.readTextFile(path);
    },
  });
}
