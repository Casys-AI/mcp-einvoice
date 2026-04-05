/**
 * E-Invoice Core
 *
 * PA-agnostic adapter layer for e-invoicing.
 * Types, adapters (Iopole, Storecove, SuperPDP), shared utilities.
 *
 * @module @casys/einvoice-core
 */

// ─── Interface & Types ──────────────────────────────────────
export type {
  AdapterMethodName,
  BusinessEntityRow,
  CreateWebhookRequest,
  DirectoryFrRow,
  DirectoryFrSearchFilters,
  DirectoryIntSearchFilters,
  DownloadResult,
  EInvoiceAdapter,
  EmitInvoiceRequest,
  GenerateFacturXRequest,
  GenerateInvoiceRequest,
  InvoiceDetail,
  InvoiceDirection,
  InvoiceLineItem,
  InvoiceSearchFilters,
  InvoiceSearchRow,
  ListBusinessEntitiesResult,
  PaginatedRequest,
  SearchDirectoryFrResult,
  SearchInvoicesResult,
  SendStatusRequest,
  StatusEntry,
  StatusHistoryResult,
  UpdateWebhookRequest,
} from "./src/adapter.ts";

// ─── Adapters ───────────────────────────────────────────────
export { BaseAdapter } from "./src/adapters/base-adapter.ts";
export { createAdapter, listAdapterNames } from "./src/adapters/registry.ts";
export {
  createIopoleAdapter,
  IopoleAdapter,
} from "./src/adapters/iopole/adapter.ts";
export { createStorecoveAdapter } from "./src/adapters/storecove/adapter.ts";
export { createSuperPDPAdapter } from "./src/adapters/superpdp/adapter.ts";

// ─── Iopole Client (for direct use or DI in tests) ──────────
export {
  IopoleClient,
} from "./src/adapters/iopole/client.ts";
export type {
  IopoleClientConfig,
} from "./src/adapters/iopole/client.ts";

// ─── Errors ─────────────────────────────────────────────────
export {
  AdapterAPIError,
  NotSupportedError,
} from "./src/adapters/shared/errors.ts";

// ─── Shared Utilities ───────────────────────────────────────
export {
  BaseHttpClient,
  type BaseClientConfig,
} from "./src/adapters/shared/http-client.ts";
export {
  createOAuth2TokenProvider,
  type OAuth2Config,
} from "./src/adapters/shared/oauth2.ts";
export {
  encodePathSegment,
  uint8ToBase64,
} from "./src/adapters/shared/encoding.ts";
export { requireEnv } from "./src/adapters/shared/env.ts";
export { normalizeDirection } from "./src/adapters/shared/direction.ts";

// ─── Testing ────────────────────────────────────────────────
export {
  createMockAdapter,
  mockFetch,
  type CapturedRequest,
  type MockResponse,
} from "./src/testing/helpers.ts";
