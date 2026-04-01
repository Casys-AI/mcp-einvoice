import { assertEquals, assertStringIncludes } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

const AUTH = { Authorization: "Bearer test-key" };

describe("Invoice routes", () => {
  describe("GET /api/invoices (searchInvoices)", () => {
    it("returns 200 and calls searchInvoices", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices", { headers: AUTH });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "searchInvoices");
    });

    it("passes query params to searchInvoices", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/invoices?q=test&direction=received&status=delivered&offset=10&limit=5",
        { headers: AUTH },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "searchInvoices");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.q, "test");
      assertEquals(args.direction, "received");
      assertEquals(args.status, "delivered");
      assertEquals(args.offset, 10);
      assertEquals(args.limit, 5);
    });
  });

  describe("GET /api/invoices/{id} (getInvoice)", () => {
    it("returns 200 and calls getInvoice with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-42", { headers: AUTH });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getInvoice");
      assertEquals(call?.args[0], "inv-42");
    });

    it("returns invoice with matching id", async () => {
      const { adapter } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-99", { headers: AUTH });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.id, "inv-99");
    });
  });

  describe("POST /api/invoices/{id}/mark-seen (markInvoiceSeen)", () => {
    it("returns 200 and calls markInvoiceSeen with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-5/mark-seen", {
        method: "POST",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "markInvoiceSeen");
      assertEquals(call?.args[0], "inv-5");
    });
  });

  describe("GET /api/invoices/unseen (getUnseenInvoices)", () => {
    it("returns 200 and calls getUnseenInvoices", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/unseen", { headers: AUTH });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "getUnseenInvoices");
    });

    it("passes pagination params", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/invoices/unseen?offset=0&limit=20",
        { headers: AUTH },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getUnseenInvoices");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.offset, 0);
      assertEquals(args.limit, 20);
    });
  });

  describe("POST /api/invoices/generate/cii (generateCII)", () => {
    it("returns 200 with XML text and calls generateCII", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/generate/cii", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: { id: "test" }, flavor: "EN16931" }),
      });
      assertEquals(res.status, 200);
      const text = await res.text();
      assertStringIncludes(text, "<xml>");
      assertEquals(calls.at(-1)?.method, "generateCII");
    });

    it("passes invoice and flavor to generateCII", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      await app.request("/api/invoices/generate/cii", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice: { invoiceNumber: "INV-001" },
          flavor: "MINIMUM",
        }),
      });
      const call = calls.find((c) => c.method === "generateCII");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.flavor, "MINIMUM");
      assertEquals((args.invoice as Record<string, unknown>).invoiceNumber, "INV-001");
    });
  });

  describe("POST /api/invoices/generate/ubl (generateUBL)", () => {
    it("returns 200 with XML text and calls generateUBL", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/generate/ubl", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: {}, flavor: "EN16931" }),
      });
      assertEquals(res.status, 200);
      const text = await res.text();
      assertStringIncludes(text, "<xml>");
      assertEquals(calls.at(-1)?.method, "generateUBL");
    });
  });

  describe("POST /api/invoices/generate/facturx (generateFacturX)", () => {
    it("returns 200 with binary PDF and calls generateFacturX", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/generate/facturx", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: {}, flavor: "EN16931" }),
      });
      assertEquals(res.status, 200);
      assertEquals(res.headers.get("content-type"), "application/pdf");
      assertEquals(calls.at(-1)?.method, "generateFacturX");
    });
  });

  describe("POST /api/invoices/emit (emitInvoice)", () => {
    it("returns 200 and calls emitInvoice", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      // Encode a small test file to base64
      const fileBytes = new Uint8Array([60, 120, 109, 108, 62]); // <xml>
      const base64 = btoa(String.fromCharCode(...fileBytes));

      const res = await app.request("/api/invoices/emit", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ file_base64: base64, filename: "test.xml" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "emitInvoice");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.filename, "test.xml");
      assertEquals(args.file instanceof Uint8Array, true);
    });
  });

  describe("GET /api/invoices/{id}/download (downloadInvoice)", () => {
    it("returns binary content and calls downloadInvoice", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-1/download", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      assertEquals(res.headers.get("content-type"), "application/xml");
      const call = calls.find((c) => c.method === "downloadInvoice");
      assertEquals(call?.args[0], "inv-1");
    });
  });

  describe("GET /api/invoices/{id}/readable (downloadReadable)", () => {
    it("returns binary PDF and calls downloadReadable", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-2/readable", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      assertEquals(res.headers.get("content-type"), "application/pdf");
      const call = calls.find((c) => c.method === "downloadReadable");
      assertEquals(call?.args[0], "inv-2");
    });
  });

  describe("GET /api/invoices/{id}/files (getInvoiceFiles)", () => {
    it("returns 200 and calls getInvoiceFiles", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-3/files", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getInvoiceFiles");
      assertEquals(call?.args[0], "inv-3");
    });
  });

  describe("GET /api/invoices/{id}/attachments (getAttachments)", () => {
    it("returns 200 and calls getAttachments", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-4/attachments", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getAttachments");
      assertEquals(call?.args[0], "inv-4");
    });
  });

  describe("GET /api/files/{fileId}/download (downloadFile)", () => {
    it("returns binary content and calls downloadFile", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/files/file-123/download", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get("content-type"),
        "application/octet-stream",
      );
      const call = calls.find((c) => c.method === "downloadFile");
      assertEquals(call?.args[0], "file-123");
    });
  });
});
