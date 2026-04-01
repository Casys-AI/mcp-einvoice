import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "./app.ts";
import { createMockAdapter } from "@casys/einvoice-core";
import type { AdapterMethodName, EInvoiceAdapter } from "@casys/einvoice-core";

describe("REST API app", () => {
  const { adapter } = createMockAdapter();
  const app = createApp(adapter, "test-api-key-123");

  describe("API key auth", () => {
    it("rejects requests without API key", async () => {
      const res = await app.request("/api/health");
      assertEquals(res.status, 401);
    });

    it("rejects requests with wrong API key", async () => {
      const res = await app.request("/api/health", {
        headers: { Authorization: "Bearer wrong-key" },
      });
      assertEquals(res.status, 401);
    });

    it("accepts requests with correct API key", async () => {
      const res = await app.request("/api/health", {
        headers: { Authorization: "Bearer test-api-key-123" },
      });
      assertEquals(res.status, 200);
    });
  });

  describe("utility endpoints", () => {
    it("serves OpenAPI spec at /openapi.json", async () => {
      const res = await app.request("/openapi.json");
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.openapi, "3.1.0");
    });

    it("serves Swagger UI at /docs", async () => {
      const res = await app.request("/docs");
      assertEquals(res.status, 200);
    });

    it("serves health check", async () => {
      const res = await app.request("/api/health", {
        headers: { Authorization: "Bearer test-api-key-123" },
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.status, "ok");
      assertEquals(body.adapter, "mock");
    });
  });

  describe("capabilities endpoint", () => {
    it("returns adapter name and sorted capabilities list", async () => {
      const res = await app.request("/api/capabilities", {
        headers: { Authorization: "Bearer test-api-key-123" },
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.adapter, "mock");
      assertEquals(Array.isArray(body.capabilities), true);
      // Verify the list is sorted
      const sorted = [...body.capabilities].sort();
      assertEquals(body.capabilities, sorted);
      // Verify a few known capabilities are present
      assertEquals(body.capabilities.includes("searchInvoices"), true);
      assertEquals(body.capabilities.includes("getInvoice"), true);
    });

    it("requires API key for capabilities endpoint", async () => {
      const res = await app.request("/api/capabilities");
      assertEquals(res.status, 401);
    });
  });
});

describe("REST API capability filtering", () => {
  // Build a minimal adapter with only 2 invoice capabilities.
  // We cast stub return values to satisfy TypeScript without importing every result type.
  // deno-lint-ignore no-explicit-any
  const noop = () => Promise.resolve({} as any);
  const limitedAdapter: EInvoiceAdapter = {
    name: "limited",
    capabilities: new Set<AdapterMethodName>([
      "searchInvoices",
      "getInvoice",
    ]),
    // Invoice
    emitInvoice: noop,
    searchInvoices: () => Promise.resolve({ rows: [], count: 0 }),
    getInvoice: (id) =>
      Promise.resolve({ id, status: "DELIVERED", direction: "received" as const }),
    downloadInvoice: noop,
    downloadReadable: noop,
    getInvoiceFiles: noop,
    getAttachments: noop,
    downloadFile: noop,
    markInvoiceSeen: noop,
    getUnseenInvoices: noop,
    generateCII: () => Promise.resolve("<xml/>"),
    generateUBL: () => Promise.resolve("<xml/>"),
    generateFacturX: noop,
    // Directory
    searchDirectoryFr: () => Promise.resolve({ rows: [], count: 0 }),
    searchDirectoryInt: noop,
    checkPeppolParticipant: noop,
    // Status
    sendStatus: noop,
    getStatusHistory: () => Promise.resolve({ entries: [] }),
    getUnseenStatuses: noop,
    markStatusSeen: noop,
    // Reporting
    reportInvoiceTransaction: noop,
    reportTransaction: noop,
    // Webhooks
    listWebhooks: noop,
    getWebhook: noop,
    createWebhook: noop,
    updateWebhook: noop,
    deleteWebhook: noop,
    // Config
    getCustomerId: noop,
    listBusinessEntities: noop,
    getBusinessEntity: noop,
    createLegalUnit: noop,
    createOffice: noop,
    deleteBusinessEntity: noop,
    configureBusinessEntity: noop,
    claimBusinessEntity: noop,
    claimBusinessEntityByIdentifier: noop,
    enrollFrench: noop,
    enrollInternational: noop,
    registerNetwork: noop,
    registerNetworkByScheme: noop,
    unregisterNetwork: noop,
    createIdentifier: noop,
    createIdentifierByScheme: noop,
    deleteIdentifier: noop,
    deleteClaim: noop,
  };

  const limitedApp = createApp(limitedAdapter, null);

  it("registers GET /api/invoices when searchInvoices is in capabilities", async () => {
    const res = await limitedApp.request("/api/invoices");
    assertEquals(res.status, 200);
  });

  it("does not register POST /api/invoices/generate/cii when generateCII is not in capabilities", async () => {
    const res = await limitedApp.request("/api/invoices/generate/cii", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: {}, flavor: "facturx" }),
    });
    assertEquals(res.status, 404);
  });
});
