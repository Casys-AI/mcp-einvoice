/**
 * E-Invoice Tool Interface
 *
 * Defines the shape of a single MCP tool in the einvoice library.
 * Tools are PA-agnostic — they call adapter methods, not API endpoints.
 *
 * @module lib/einvoice/src/tools/types
 */

import type { EInvoiceAdapter } from "../adapter.ts";

/** Available tool categories */
export type EInvoiceToolCategory =
  | "invoice"
  | "directory"
  | "status"
  | "reporting"
  | "webhook";

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
  _meta?: { ui: { resourceUri: string } };
}

/** Convert an EInvoiceTool to MCP wire format */
export function toMCPWireFormat(tool: EInvoiceTool): MCPToolWireFormat {
  const wire: MCPToolWireFormat = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
  if (tool._meta) wire._meta = tool._meta;
  return wire;
}
