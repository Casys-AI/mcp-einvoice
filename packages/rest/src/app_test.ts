import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "./app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

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
});
