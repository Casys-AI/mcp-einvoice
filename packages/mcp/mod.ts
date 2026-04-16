/**
 * MCP E-Invoice Library
 *
 * PA-agnostic MCP tools for French e-invoicing.
 * Currently implemented: Iopole (REST/JSON).
 * Extensible to other PA via the EInvoiceAdapter interface.
 *
 * Tools available (27 tools, 5 categories):
 *   Invoice:   emit, search, get, download, download_readable, files,
 *              attachments, download_file, mark_seen, not_seen,
 *              generate_cii, generate_ubl, generate_facturx
 *   Directory: fr_search, int_search, peppol_check
 *   Status:    send, history, not_seen, mark_seen
 *   Reporting: invoice_transaction, transaction
 *   Webhook:   list, get, create, update, delete
 *
 * @module lib/einvoice
 */

// Adapter interface & types (from core)
export type {
  CreateWebhookRequest,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  DownloadResult,
  EInvoiceAdapter,
  EmitInvoiceRequest,
  GenerateFacturXRequest,
  GenerateInvoiceRequest,
  InvoiceSearchFilters,
  PaginatedRequest,
  SendStatusRequest,
  UpdateWebhookRequest,
} from "@casys/einvoice-core";

// Adapters (from core)
export { createIopoleAdapter, IopoleAdapter } from "@casys/einvoice-core";

// Tools registry
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/tools/mod.ts";

export type {
  EInvoiceTool,
  EInvoiceToolCategory,
  JSONSchema,
  MCPToolWireFormat,
} from "./src/tools/types.ts";

// Tools client — orchestrates tool registration with an adapter.
// Used by the bundled `server.ts` to assemble a single-tenant MCP server,
// and by external consumers to assemble multi-tenant MCP servers (one
// EInvoiceToolsClient per tenant, paired with that tenant's adapter
// instance — see einvoice-platform for the multi-tenant SaaS pattern).
export { EInvoiceToolsClient } from "./src/client.ts";
export type { EInvoiceToolsClientOptions } from "./src/client.ts";

// Low-level Iopole client (for direct use or DI in tests)
export { IopoleClient } from "@casys/einvoice-core";

export type { IopoleClientConfig, OAuth2Config } from "@casys/einvoice-core";

// Viewer names type (the actual registration is via
// EInvoiceToolsClient.registerViewers — see src/viewers.ts)
export type { EInvoiceViewerName } from "./src/viewers.ts";
