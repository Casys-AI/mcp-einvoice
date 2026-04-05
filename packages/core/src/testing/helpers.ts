/**
 * Test Helpers for E-Invoice
 *
 * Mock fetch, mock adapter, and test utilities.
 *
 * @module lib/einvoice/src/testing/helpers
 */

import type {
  AdapterMethodName,
  DownloadResult,
  EInvoiceAdapter,
  FileEntry,
  SearchDirectoryIntResult,
  WebhookDetail,
} from "../adapter.ts";

// ─── Mock Fetch ──────────────────────────────────────────

export interface MockResponse {
  status: number;
  body: unknown;
  contentType?: string;
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown | null;
}

/**
 * Mock globalThis.fetch with a queue of responses.
 * Returns a restore function and captured requests array.
 */
export function mockFetch(
  responses: MockResponse[],
): { restore: () => void; captured: CapturedRequest[] } {
  let callIndex = 0;
  const original = globalThis.fetch;
  const captured: CapturedRequest[] = [];

  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const config = responses[callIndex++];
    if (!config) throw new Error(`No more mock responses (call #${callIndex})`);

    let bodyParsed: unknown | null = null;
    if (init?.body instanceof FormData) {
      // For multipart uploads, record the form field names
      const fields: Record<string, string> = {};
      for (const [key, value] of init.body.entries()) {
        if (value instanceof Blob) {
          fields[key] = `[Blob: ${
            (value as File).name ?? "unnamed"
          }, ${value.size} bytes]`;
        } else {
          fields[key] = String(value);
        }
      }
      bodyParsed = fields;
    } else if (init?.body && typeof init.body === "string") {
      try {
        bodyParsed = JSON.parse(init.body);
      } catch {
        bodyParsed = init.body;
      }
    }

    captured.push({
      url: url.toString(),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: bodyParsed,
    });

    const responseBody = typeof config.body === "string"
      ? config.body
      : JSON.stringify(config.body);

    return new Response(responseBody, {
      status: config.status,
      headers: {
        "content-type": config.contentType ?? "application/json",
      },
    });
  };

  return {
    restore: () => {
      globalThis.fetch = original;
    },
    captured,
  };
}

// ─── Mock Adapter ────────────────────────────────────────

/**
 * Creates a mock EInvoiceAdapter that records all calls.
 * Every method returns the provided default response.
 */
export function createMockAdapter(
  defaultResponse: unknown = { ok: true },
): {
  adapter: EInvoiceAdapter;
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  function record(method: string, ...args: unknown[]) {
    calls.push({ method, args });
    return Promise.resolve(defaultResponse);
  }

  const adapter: EInvoiceAdapter = {
    name: "mock",
    capabilities: new Set<AdapterMethodName>([
      "emitInvoice",
      "searchInvoices",
      "getInvoice",
      "downloadInvoice",
      "downloadReadable",
      "getInvoiceFiles",
      "getAttachments",
      "downloadFile",
      "markInvoiceSeen",
      "getUnseenInvoices",
      "generateCII",
      "generateUBL",
      "generateFacturX",
      "searchDirectoryFr",
      "searchDirectoryInt",
      "checkPeppolParticipant",
      "sendStatus",
      "getStatusHistory",
      "getUnseenStatuses",
      "markStatusSeen",
      "reportInvoiceTransaction",
      "reportTransaction",
      "listWebhooks",
      "getWebhook",
      "createWebhook",
      "updateWebhook",
      "deleteWebhook",
      "getCustomerId",
      "listBusinessEntities",
      "getBusinessEntity",
      "createLegalUnit",
      "createOffice",
      "deleteBusinessEntity",
      "configureBusinessEntity",
      "claimBusinessEntity",
      "claimBusinessEntityByIdentifier",
      "enrollFrench",
      "enrollInternational",
      "registerNetwork",
      "registerNetworkByScheme",
      "unregisterNetwork",
      "createIdentifier",
      "createIdentifierByScheme",
      "deleteIdentifier",
      "deleteClaim",
    ]),

    // Invoice
    emitInvoice: (req) =>
      record("emitInvoice", req) as Promise<Record<string, unknown>>,
    searchInvoices: (filters) =>
      record("searchInvoices", filters).then(() => ({
        rows: [],
        count: 0,
      })),
    getInvoice: (id) =>
      record("getInvoice", id).then(() => ({
        id: id as string,
        status: "DELIVERED",
        direction: "received" as const,
      })),
    downloadInvoice: (id) =>
      record("downloadInvoice", id).then(() => ({
        data: new Uint8Array([1, 2, 3]),
        contentType: "application/xml",
      })) as Promise<DownloadResult>,
    downloadReadable: (id) =>
      record("downloadReadable", id).then(() => ({
        data: new Uint8Array([4, 5, 6]),
        contentType: "application/pdf",
      })) as Promise<DownloadResult>,
    getInvoiceFiles: (id) =>
      record("getInvoiceFiles", id).then(() => []) as Promise<FileEntry[]>,
    getAttachments: (id) =>
      record("getAttachments", id).then(() => []) as Promise<FileEntry[]>,
    downloadFile: (fileId) =>
      record("downloadFile", fileId).then(() => ({
        data: new Uint8Array([7, 8, 9]),
        contentType: "application/octet-stream",
      })) as Promise<DownloadResult>,
    markInvoiceSeen: (id) =>
      record("markInvoiceSeen", id) as Promise<Record<string, unknown>>,
    getUnseenInvoices: (p) =>
      record("getUnseenInvoices", p) as Promise<Record<string, unknown>>,
    generateCII: (req) =>
      record("generateCII", req).then(() => "<xml>mock</xml>") as Promise<
        string
      >,
    generateUBL: (req) =>
      record("generateUBL", req).then(() => "<xml>mock</xml>") as Promise<
        string
      >,
    generateFacturX: (req) =>
      record("generateFacturX", req).then(() => ({
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        contentType: "application/pdf",
      })) as Promise<DownloadResult>,

    // Directory
    searchDirectoryFr: (f) =>
      record("searchDirectoryFr", f).then(() => ({ rows: [], count: 0 })),
    searchDirectoryInt: (f) =>
      record("searchDirectoryInt", f).then(() => ({
        rows: [],
        count: 0,
      })) as Promise<SearchDirectoryIntResult>,
    checkPeppolParticipant: (scheme, value) =>
      record("checkPeppolParticipant", scheme, value) as Promise<
        Record<string, unknown>
      >,

    // Status
    sendStatus: (r) =>
      record("sendStatus", r) as Promise<Record<string, unknown>>,
    getStatusHistory: (invoiceId) =>
      record("getStatusHistory", invoiceId).then((r) => {
        // Ensure return matches StatusHistoryResult shape
        const result = r as Record<string, unknown>;
        if (result && Array.isArray(result.entries)) {
          return r as { entries: Array<{ date: string; code: string }> };
        }
        return { entries: [] };
      }),
    getUnseenStatuses: (p) =>
      record("getUnseenStatuses", p) as Promise<Record<string, unknown>>,
    markStatusSeen: (statusId) =>
      record("markStatusSeen", statusId) as Promise<Record<string, unknown>>,

    // Reporting
    reportInvoiceTransaction: (scheme, value, t) =>
      record("reportInvoiceTransaction", scheme, value, t) as Promise<
        Record<string, unknown>
      >,
    reportTransaction: (scheme, value, t) =>
      record("reportTransaction", scheme, value, t) as Promise<Record<string, unknown>>,

    // Webhooks
    listWebhooks: () =>
      record("listWebhooks").then(() => []) as Promise<WebhookDetail[]>,
    getWebhook: (id) =>
      record("getWebhook", id).then(() => ({
        id: String(id), name: "mock", url: "https://example.com/hook", events: [], active: true,
      })) as Promise<WebhookDetail>,
    createWebhook: (r) =>
      record("createWebhook", r).then(() => ({
        id: "mock-wh-id", name: r.name ?? "mock", url: r.url, events: r.events, active: true,
      })) as Promise<WebhookDetail>,
    updateWebhook: (id, r) =>
      record("updateWebhook", id, r).then(() => ({
        id: String(id), name: r.name, url: r.url, events: r.events, active: r.active ?? true,
      })) as Promise<WebhookDetail>,
    deleteWebhook: (id) =>
      record("deleteWebhook", id) as Promise<Record<string, unknown>>,

    // Config
    getCustomerId: () =>
      record("getCustomerId").then(() => "mock-customer-id") as Promise<string>,
    listBusinessEntities: () =>
      record("listBusinessEntities").then(() => ({ rows: [], count: 0 })),
    getBusinessEntity: (id) =>
      record("getBusinessEntity", id) as Promise<Record<string, unknown>>,
    createLegalUnit: (data) =>
      record("createLegalUnit", data) as Promise<Record<string, unknown>>,
    createOffice: (data) =>
      record("createOffice", data) as Promise<Record<string, unknown>>,
    deleteBusinessEntity: (id) =>
      record("deleteBusinessEntity", id) as Promise<Record<string, unknown>>,
    configureBusinessEntity: (id, data) =>
      record("configureBusinessEntity", id, data) as Promise<
        Record<string, unknown>
      >,
    claimBusinessEntity: (id, data) =>
      record("claimBusinessEntity", id, data) as Promise<
        Record<string, unknown>
      >,
    claimBusinessEntityByIdentifier: (scheme, value, data) =>
      record("claimBusinessEntityByIdentifier", scheme, value, data) as Promise<
        Record<string, unknown>
      >,
    enrollFrench: (data) =>
      record("enrollFrench", data) as Promise<Record<string, unknown>>,
    enrollInternational: (data) =>
      record("enrollInternational", data) as Promise<Record<string, unknown>>,
    registerNetwork: (id, network) =>
      record("registerNetwork", id, network) as Promise<
        Record<string, unknown>
      >,
    registerNetworkByScheme: (scheme, value, network) =>
      record("registerNetworkByScheme", scheme, value, network) as Promise<
        Record<string, unknown>
      >,
    unregisterNetwork: (id) =>
      record("unregisterNetwork", id) as Promise<Record<string, unknown>>,
    createIdentifier: (entityId, data) =>
      record("createIdentifier", entityId, data) as Promise<
        Record<string, unknown>
      >,
    createIdentifierByScheme: (scheme, value, data) =>
      record("createIdentifierByScheme", scheme, value, data) as Promise<
        Record<string, unknown>
      >,
    deleteIdentifier: (id) =>
      record("deleteIdentifier", id) as Promise<Record<string, unknown>>,
    deleteClaim: (id) =>
      record("deleteClaim", id) as Promise<Record<string, unknown>>,
  };

  return { adapter, calls };
}
