import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

const AUTH = { Authorization: "Bearer test-key" };

describe("Webhook routes", () => {
  describe("GET /api/webhooks (listWebhooks)", () => {
    it("returns 200 and calls listWebhooks", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/webhooks", { headers: AUTH });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "listWebhooks");
    });
  });

  describe("POST /api/webhooks (createWebhook)", () => {
    it("returns 200 and calls createWebhook with url and events", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/webhooks", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/hook",
          events: ["invoice.received", "status.updated"],
          name: "My Webhook",
        }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "createWebhook");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.url, "https://example.com/hook");
      assertEquals(args.name, "My Webhook");
    });
  });

  describe("GET /api/webhooks/{id} (getWebhook)", () => {
    it("returns 200 and calls getWebhook with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/webhooks/wh-42", { headers: AUTH });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getWebhook");
      assertEquals(call?.args[0], "wh-42");
    });
  });

  describe("PUT /api/webhooks/{id} (updateWebhook)", () => {
    it("returns 200 and calls updateWebhook with id and body", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/webhooks/wh-10", {
        method: "PUT",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "updateWebhook");
      assertEquals(call?.args[0], "wh-10");
      const body = call?.args[1] as Record<string, unknown>;
      assertEquals(body.active, false);
    });
  });

  describe("DELETE /api/webhooks/{id} (deleteWebhook)", () => {
    it("returns 200 and calls deleteWebhook with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/webhooks/wh-99", {
        method: "DELETE",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "deleteWebhook");
      assertEquals(call?.args[0], "wh-99");
    });
  });
});
