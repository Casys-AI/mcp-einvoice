/**
 * Tool Error Mapper for the MCP framework.
 *
 * Maps tool errors to business-friendly messages (isError: true)
 * or returns null to rethrow as JSON-RPC errors.
 *
 * Replaces the local withErrorHandler wrapper — error mapping is now
 * handled by the framework via ConcurrentMCPServer.toolErrorMapper.
 *
 * @module lib/einvoice/src/tools/error-mapper
 */

import { NotSupportedError, AdapterAPIError } from "../adapters/shared/errors.ts";

/**
 * Map tool errors to user-friendly messages.
 * Returns a string → framework produces { isError: true, content: [{ text: msg }] }
 * Returns null → framework rethrows as JSON-RPC error.
 */
export function einvoiceErrorMapper(error: unknown, toolName: string): string | null {
  if (error instanceof NotSupportedError) {
    return error.message;
  }

  if (error instanceof AdapterAPIError) {
    return `[${toolName}] API error ${error.status}: ${error.message.slice(0, 300)}`;
  }

  if (error instanceof Error) {
    // Validation errors — return as business error
    if (error.message.includes("is required") || error.message.includes("must ")) {
      return error.message;
    }
    // Other known errors — return truncated
    return `[${toolName}] ${error.message.slice(0, 300)}`;
  }

  // Unknown — let framework handle
  return null;
}
