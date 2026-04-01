/**
 * E-Invoice Tool Interface
 *
 * Defines the shape of a single MCP tool in the einvoice library.
 * Tools are PA-agnostic — they call adapter methods, not API endpoints.
 *
 * @module lib/einvoice/src/tools/types
 */

import type { AdapterMethodName, EInvoiceAdapter } from "@casys/einvoice-core";

/** Available tool categories */
export type EInvoiceToolCategory =
  | "invoice"
  | "directory"
  | "status"
  | "reporting"
  | "webhook"
  | "config";

/** JSON Schema for tool inputs (MCP wire format) */
export type JSONSchema = {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JSONSchema;
  [key: string]: unknown;
};

/** Context passed to every tool handler */
export interface EInvoiceToolContext {
  adapter: EInvoiceAdapter;
}

/**
 * A single E-Invoice MCP tool.
 * Each tool maps to a business operation via the adapter interface.
 */
/** Behavioural hints for the model/host (MCP SDK 1.27). */
export interface ToolAnnotations {
  /** Short title for UI display */
  title?: string;
  /** True if the tool has no side effects (safe to call speculatively) */
  readOnlyHint?: boolean;
  /** True if the tool may produce irreversible effects */
  destructiveHint?: boolean;
}

export interface EInvoiceTool {
  /** Unique tool name, snake_case, prefixed with einvoice_ */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Category for grouping/filtering */
  category: EInvoiceToolCategory;
  /** JSON Schema for tool input parameters */
  inputSchema: JSONSchema;
  /** MCP Apps UI metadata (optional) */
  _meta?: { ui: { resourceUri: string } };
  /** Behavioural hints for model/host */
  annotations?: ToolAnnotations;
  /** Adapter method names this tool requires. Tool is hidden when the
   *  active adapter doesn't support all listed methods. */
  requires?: readonly AdapterMethodName[];
  /** Execute the tool and return a JSON-serializable result */
  handler: (
    input: Record<string, unknown>,
    ctx: EInvoiceToolContext,
  ) => Promise<unknown>;
}

/** MCP wire-format tool (for ConcurrentMCPServer registration) */
export interface MCPToolWireFormat {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  annotations?: ToolAnnotations;
  _meta?: { ui: { resourceUri: string } };
}
