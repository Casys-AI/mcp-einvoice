/**
 * E-Invoice Tools Client
 *
 * Client for executing E-Invoice tools with MCP interface support.
 * Uses the PA-agnostic adapter pattern.
 *
 * @module lib/einvoice/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import type { EInvoiceTool, EInvoiceToolCategory, JSONSchema, MCPToolWireFormat } from "./tools/types.ts";
import type { EInvoiceAdapter } from "./adapter.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};

export type { EInvoiceTool, EInvoiceToolCategory, JSONSchema, MCPToolWireFormat };

// ============================================================================
// EInvoiceToolsClient Class
// ============================================================================

/** Configuration options for {@link EInvoiceToolsClient}. */
export interface EInvoiceToolsClientOptions {
  /** Restrict tools to specific categories. Omit to load all. */
  categories?: string[];
}

/**
 * Client for executing E-Invoice tools via a PA adapter.
 * The adapter is injected at handler build time, not at construction.
 */
export class EInvoiceToolsClient {
  private tools: EInvoiceTool[];

  constructor(options?: EInvoiceToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /** List available tools */
  listTools(): EInvoiceTool[] {
    return this.tools;
  }

  /** Filter tools to only those supported by the given adapter's capabilities. */
  private supportedTools(adapter: EInvoiceAdapter): EInvoiceTool[] {
    return this.tools.filter((t) =>
      !t.requires || t.requires.every((m) => adapter.capabilities.has(m))
    );
  }

  /** Convert tools to MCP wire format, filtered by adapter capabilities. */
  toMCPFormat(adapter: EInvoiceAdapter): MCPToolWireFormat[] {
    return this.supportedTools(adapter).map((t) => {
      const wire: MCPToolWireFormat = {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as JSONSchema,
      };
      if (t._meta) wire._meta = t._meta;
      if (t.annotations) wire.annotations = t.annotations;
      return wire;
    });
  }

  /**
   * Build a handlers Map for ConcurrentMCPServer.registerTools().
   * Each handler wraps the tool to inject the adapter context.
   * Only includes tools supported by the adapter's capabilities.
   */
  buildHandlersMap(
    adapter: EInvoiceAdapter,
  ): Map<string, (args: Record<string, unknown>) => Promise<unknown>> {
    const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
    for (const tool of this.supportedTools(adapter)) {
      handlers.set(tool.name, async (args: Record<string, unknown>) => {
        return await tool.handler(args, { adapter });
      });
    }
    return handlers;
  }

  /** Execute a tool by name */
  async execute(
    name: string,
    args: Record<string, unknown>,
    adapter: EInvoiceAdapter,
  ): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `[EInvoiceToolsClient] Unknown tool: "${name}". ` +
          `Available: ${this.tools.map((t) => t.name).join(", ")}`,
      );
    }
    return await tool.handler(args, { adapter });
  }

  /** Get tool count */
  get count(): number {
    return this.tools.length;
  }
}
