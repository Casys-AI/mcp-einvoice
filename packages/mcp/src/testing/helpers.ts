/**
 * MCP-specific test helpers.
 *
 * @module mcp-einvoice/src/testing/helpers
 */

// Re-export core test helpers for convenience
export { createMockAdapter, mockFetch } from "@casys/einvoice-core";
export type { CapturedRequest, MockResponse } from "@casys/einvoice-core";

/**
 * Unwrap a StructuredToolResult: if the result has { content, structuredContent },
 * return structuredContent. Otherwise return the result as-is.
 */
export function unwrapStructured(result: unknown): Record<string, unknown> {
  const r = result as Record<string, unknown>;
  if (
    r && typeof r.content === "string" && r.structuredContent &&
    typeof r.structuredContent === "object"
  ) {
    return r.structuredContent as Record<string, unknown>;
  }
  return r;
}
