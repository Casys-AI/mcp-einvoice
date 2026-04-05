import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

const AUTH = { Authorization: "Bearer test-key" };

describe("Reporting routes", () => {
  describe("POST /api/reporting/scheme/{scheme}/value/{value}/invoice-transaction (reportInvoiceTransaction)", () => {
    it("returns 200 and calls reportInvoiceTransaction", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/reporting/scheme/0009/value/43446637100011/invoice-transaction",
        {
          method: "POST",
          headers: { ...AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: "inv-1", amount: 100 }),
        },
      );
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "reportInvoiceTransaction");
    });

    it("passes scheme, value, and body to reportInvoiceTransaction", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      await app.request(
        "/api/reporting/scheme/0009/value/43446637100011/invoice-transaction",
        {
          method: "POST",
          headers: { ...AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: "inv-42", currency: "EUR" }),
        },
      );
      const call = calls.find((c) => c.method === "reportInvoiceTransaction");
      assertEquals(call?.args[0], "0009");
      assertEquals(call?.args[1], "43446637100011");
      const body = call?.args[2] as Record<string, unknown>;
      assertEquals(body.invoiceId, "inv-42");
      assertEquals(body.currency, "EUR");
    });
  });

  describe("POST /api/reporting/scheme/{scheme}/value/{value}/transaction (reportTransaction)", () => {
    it("returns 200 and calls reportTransaction with scheme and value", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/reporting/scheme/0009/value/43446637100011/transaction",
        {
          method: "POST",
          headers: { ...AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 200 }),
        },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "reportTransaction");
      assertEquals(call?.args[0], "0009");
      assertEquals(call?.args[1], "43446637100011");
      const body = call?.args[2] as Record<string, unknown>;
      assertEquals(body.amount, 200);
    });
  });
});
