import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

const AUTH = { Authorization: "Bearer test-key" };

describe("Status routes", () => {
  describe("POST /api/invoices/{id}/status (sendStatus)", () => {
    it("returns 200 and calls sendStatus with invoiceId and code", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-10/status", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ code: "212" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "sendStatus");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.invoiceId, "inv-10");
      assertEquals(args.code, "212");
    });

    it("passes optional message and payment to sendStatus", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      await app.request("/api/invoices/inv-20/status", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "213",
          message: "Rejected: missing VAT",
          payment: { amount: 100 },
        }),
      });
      const call = calls.find((c) => c.method === "sendStatus");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.invoiceId, "inv-20");
      assertEquals(args.message, "Rejected: missing VAT");
      assertEquals((args.payment as Record<string, unknown>).amount, 100);
    });
  });

  describe("GET /api/invoices/{id}/status-history (getStatusHistory)", () => {
    it("returns 200 and calls getStatusHistory with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/invoices/inv-30/status-history", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getStatusHistory");
      assertEquals(call?.args[0], "inv-30");
    });
  });

  describe("GET /api/statuses/unseen (getUnseenStatuses)", () => {
    it("returns 200 and calls getUnseenStatuses", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/statuses/unseen", { headers: AUTH });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "getUnseenStatuses");
    });

    it("passes pagination params to getUnseenStatuses", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      await app.request("/api/statuses/unseen?offset=5&limit=10", {
        headers: AUTH,
      });
      const call = calls.find((c) => c.method === "getUnseenStatuses");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.offset, 5);
      assertEquals(args.limit, 10);
    });
  });

  describe("POST /api/statuses/{id}/mark-seen (markStatusSeen)", () => {
    it("returns 200 and calls markStatusSeen with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/statuses/status-99/mark-seen", {
        method: "POST",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "markStatusSeen");
      assertEquals(call?.args[0], "status-99");
    });
  });
});
