/**
 * Centralized tool error handler.
 *
 * Wraps tool handlers to normalize errors into consistent MCP-friendly responses.
 * - NotSupportedError → clear "not available" message
 * - AdapterAPIError → status code + truncated body (no leak)
 * - Validation errors → input guidance
 * - Unknown errors → generic message
 *
 * @module lib/einvoice/src/tools/error-handler
 */

import { NotSupportedError, AdapterAPIError } from "../adapters/shared/errors.ts";
import type { EInvoiceToolContext } from "./types.ts";

export interface ToolErrorResult {
  error: true;
  code: string;
  message: string;
}

/**
 * Wrap a tool handler with consistent error handling.
 * Returns a JSON error object instead of throwing — lets the MCP SDK
 * surface it as `isError: true` to the LLM.
 */
export function withErrorHandler(
  toolName: string,
  handler: (input: Record<string, unknown>, ctx: EInvoiceToolContext) => Promise<unknown>,
): (input: Record<string, unknown>, ctx: EInvoiceToolContext) => Promise<unknown> {
  return async (input, ctx) => {
    try {
      return await handler(input, ctx);
    } catch (err) {
      if (err instanceof NotSupportedError) {
        return {
          error: true,
          code: "NOT_SUPPORTED",
          message: err.message,
        } satisfies ToolErrorResult;
      }

      if (err instanceof AdapterAPIError) {
        return {
          error: true,
          code: `API_ERROR_${err.status}`,
          message: `[${toolName}] API error ${err.status}: ${err.message.slice(0, 300)}`,
        } satisfies ToolErrorResult;
      }

      if (err instanceof Error && err.message.includes("is required")) {
        return {
          error: true,
          code: "VALIDATION",
          message: err.message,
        } satisfies ToolErrorResult;
      }

      // Unknown error — don't leak internals
      const msg = err instanceof Error ? err.message : String(err);
      return {
        error: true,
        code: "INTERNAL",
        message: `[${toolName}] ${msg.slice(0, 300)}`,
      } satisfies ToolErrorResult;
    }
  };
}
