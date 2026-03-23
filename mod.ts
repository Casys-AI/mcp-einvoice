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
} from "./src/adapter.ts";

// Adapters
export {
  createIopoleAdapter,
  IopoleAdapter,
} from "./src/adapters/iopole/adapter.ts";

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
  createOAuth2TokenProvider,
  IopoleAPIError,
  IopoleClient,
} from "./src/adapters/iopole/client.ts";

export type {
  IopoleClientConfig,
  OAuth2Config,
} from "./src/adapters/iopole/client.ts";
