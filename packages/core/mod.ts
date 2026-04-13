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
  DirectoryIntRow,
  DirectoryIntSearchFilters,
  DownloadResult,
  EInvoiceAdapter,
  EmitInvoiceRequest,
  FileEntry,
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
  SearchDirectoryIntResult,
  SearchInvoicesResult,
  SendStatusRequest,
  StatusEntry,
  StatusHistoryResult,
  UpdateWebhookRequest,
  WebhookDetail,
} from "./src/adapter.ts";

// ─── Adapters ───────────────────────────────────────────────
export { BaseAdapter } from "./src/adapters/base-adapter.ts";
export { createAdapter, listAdapterNames } from "./src/adapters/registry.ts";
export {
  createIopoleAdapter,
  IopoleAdapter,
} from "./src/adapters/iopole/adapter.ts";
export {
  createStorecoveAdapter,
  StorecoveAdapter,
} from "./src/adapters/storecove/adapter.ts";
export {
  createSuperPDPAdapter,
  SuperPDPAdapter,
} from "./src/adapters/superpdp/adapter.ts";
export {
  createChorusProAdapter,
  ChorusProAdapter,
} from "./src/adapters/choruspro/adapter.ts";

// ─── Adapter Clients (for direct use, DI in tests, and multi-tenant ─
// ─── instantiation where the env-driven `create*Adapter()` factories ─
// ─── do not work — see einvoice-platform for the multi-tenant SaaS  ──
// ─── pattern) ──────────────────────────────────────────────────────
export { IopoleClient } from "./src/adapters/iopole/client.ts";
export type { IopoleClientConfig } from "./src/adapters/iopole/client.ts";

export { StorecoveClient } from "./src/adapters/storecove/client.ts";
export type { StorecoveClientConfig } from "./src/adapters/storecove/client.ts";

export { SuperPDPClient } from "./src/adapters/superpdp/client.ts";
export type { SuperPDPClientConfig } from "./src/adapters/superpdp/client.ts";

export { ChorusProClient } from "./src/adapters/choruspro/client.ts";
export type { ChorusProClientConfig } from "./src/adapters/choruspro/client.ts";

// SuperPDP also requires an AfnorClient — the AFNOR registry is a separate
// upstream service used by the SuperPDP adapter for entity lookups.
export { AfnorClient } from "./src/adapters/afnor/client.ts";
export type { AfnorClientConfig } from "./src/adapters/afnor/client.ts";

// ─── Errors ─────────────────────────────────────────────────
export {
  AdapterAPIError,
  NotSupportedError,
} from "./src/adapters/shared/errors.ts";

// ─── Shared Utilities ───────────────────────────────────────
export {
  type BaseClientConfig,
  BaseHttpClient,
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
  type CapturedRequest,
  createMockAdapter,
  mockFetch,
  type MockResponse,
} from "./src/testing/helpers.ts";
export {
  type ContractOptions,
  runAdapterContract,
} from "./src/testing/adapter-contract.ts";
