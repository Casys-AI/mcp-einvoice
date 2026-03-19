/**
 * Test Helpers for E-Invoice
 *
 * Mock fetch, mock adapter, and test utilities.
 *
 * @module lib/einvoice/src/testing/helpers
 */

import type { EInvoiceAdapter, DownloadResult } from "../adapter.ts";

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
          fields[key] = `[Blob: ${(value as File).name ?? "unnamed"}, ${value.size} bytes]`;
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

    const responseBody =
      typeof config.body === "string" ? config.body : JSON.stringify(config.body);

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
): { adapter: EInvoiceAdapter; calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  function record(method: string, ...args: unknown[]) {
    calls.push({ method, args });
    return Promise.resolve(defaultResponse);
  }

  const adapter: EInvoiceAdapter = {
    name: "mock",
    capabilities: new Set([
      "emitInvoice", "searchInvoices", "getInvoice", "downloadInvoice",
      "downloadReadable", "getInvoiceFiles", "getAttachments", "downloadFile",
      "markInvoiceSeen", "getUnseenInvoices", "generateCII", "generateUBL", "generateFacturX",
      "searchDirectoryFr", "searchDirectoryInt", "checkPeppolParticipant",
      "sendStatus", "getStatusHistory", "getUnseenStatuses", "markStatusSeen",
      "reportInvoiceTransaction", "reportTransaction",
      "listWebhooks", "getWebhook", "createWebhook", "updateWebhook", "deleteWebhook",
      "getCustomerId", "listBusinessEntities", "getBusinessEntity",
      "createLegalUnit", "createOffice", "deleteBusinessEntity",
      "configureBusinessEntity", "claimBusinessEntity", "claimBusinessEntityByIdentifier",
      "enrollFrench", "enrollInternational", "registerNetwork", "registerNetworkByScheme",
      "unregisterNetwork", "createIdentifier", "createIdentifierByScheme", "deleteIdentifier",
      "deleteClaim",
    ]),

    // Invoice
    emitInvoice: (req) => record("emitInvoice", req),
    searchInvoices: (filters) => record("searchInvoices", filters),
    getInvoice: (id) => record("getInvoice", id),
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
    getInvoiceFiles: (id) => record("getInvoiceFiles", id),
    getAttachments: (id) => record("getAttachments", id),
    downloadFile: (fileId) =>
      record("downloadFile", fileId).then(() => ({
        data: new Uint8Array([7, 8, 9]),
        contentType: "application/octet-stream",
      })) as Promise<DownloadResult>,
    markInvoiceSeen: (id) => record("markInvoiceSeen", id),
    getUnseenInvoices: (p) => record("getUnseenInvoices", p),
    generateCII: (req) => record("generateCII", req),
    generateUBL: (req) => record("generateUBL", req),
    generateFacturX: (req) => record("generateFacturX", req),

    // Directory
    searchDirectoryFr: (f) => record("searchDirectoryFr", f),
    searchDirectoryInt: (f) => record("searchDirectoryInt", f),
    checkPeppolParticipant: (scheme, value) => record("checkPeppolParticipant", scheme, value),

    // Status
    sendStatus: (r) => record("sendStatus", r),
    getStatusHistory: (invoiceId) => record("getStatusHistory", invoiceId),
    getUnseenStatuses: (p) => record("getUnseenStatuses", p),
    markStatusSeen: (statusId) => record("markStatusSeen", statusId),

    // Reporting
    reportInvoiceTransaction: (t) => record("reportInvoiceTransaction", t),
    reportTransaction: (bid, t) => record("reportTransaction", bid, t),

    // Webhooks
    listWebhooks: () => record("listWebhooks"),
    getWebhook: (id) => record("getWebhook", id),
    createWebhook: (r) => record("createWebhook", r),
    updateWebhook: (id, r) => record("updateWebhook", id, r),
    deleteWebhook: (id) => record("deleteWebhook", id),

    // Config
    getCustomerId: () => record("getCustomerId"),
    listBusinessEntities: () => record("listBusinessEntities"),
    getBusinessEntity: (id) => record("getBusinessEntity", id),
    createLegalUnit: (data) => record("createLegalUnit", data),
    createOffice: (data) => record("createOffice", data),
    deleteBusinessEntity: (id) => record("deleteBusinessEntity", id),
    configureBusinessEntity: (id, data) => record("configureBusinessEntity", id, data),
    claimBusinessEntity: (id, data) => record("claimBusinessEntity", id, data),
    claimBusinessEntityByIdentifier: (scheme, value, data) => record("claimBusinessEntityByIdentifier", scheme, value, data),
    enrollFrench: (data) => record("enrollFrench", data),
    enrollInternational: (data) => record("enrollInternational", data),
    registerNetwork: (id, network) => record("registerNetwork", id, network),
    registerNetworkByScheme: (scheme, value, network) => record("registerNetworkByScheme", scheme, value, network),
    unregisterNetwork: (id) => record("unregisterNetwork", id),
    createIdentifier: (entityId, data) => record("createIdentifier", entityId, data),
    createIdentifierByScheme: (scheme, value, data) => record("createIdentifierByScheme", scheme, value, data),
    deleteIdentifier: (id) => record("deleteIdentifier", id),
    deleteClaim: (id) => record("deleteClaim", id),
  };

  return { adapter, calls };
}
