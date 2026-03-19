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

// Adapter interface
export type {
  EInvoiceAdapter,
  DownloadResult,
  PaginatedRequest,
  EmitInvoiceRequest,
  InvoiceSearchFilters,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  GenerateInvoiceRequest,
  GenerateFacturXRequest,
  SendStatusRequest,
  CreateWebhookRequest,
  UpdateWebhookRequest,
} from "./src/adapter.ts";

// Adapters
export { IopoleAdapter, createIopoleAdapter } from "./src/adapters/iopole/adapter.ts";

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

// Low-level Iopole client (for direct use or DI in tests)
export {
  IopoleClient,
  IopoleAPIError,
  createOAuth2TokenProvider,
} from "./src/api/iopole-client.ts";

export type { IopoleClientConfig, OAuth2Config } from "./src/api/iopole-client.ts";
