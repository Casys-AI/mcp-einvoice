import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

const AUTH = { Authorization: "Bearer test-key" };

describe("Directory routes", () => {
  describe("GET /api/directory/fr (searchDirectoryFr)", () => {
    it("returns 200 and calls searchDirectoryFr", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/directory/fr?q=acme", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "searchDirectoryFr");
    });

    it("passes q and pagination params to searchDirectoryFr", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/directory/fr?q=societe&offset=10&limit=5",
        { headers: AUTH },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "searchDirectoryFr");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.q, "societe");
      assertEquals(args.offset, 10);
      assertEquals(args.limit, 5);
    });
  });

  describe("GET /api/directory/int (searchDirectoryInt)", () => {
    it("returns 200 and calls searchDirectoryInt", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/directory/int?value=0088:123456789",
        { headers: AUTH },
      );
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "searchDirectoryInt");
    });

    it("passes value param to searchDirectoryInt", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      await app.request("/api/directory/int?value=0088:987", { headers: AUTH });
      const call = calls.find((c) => c.method === "searchDirectoryInt");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.value, "0088:987");
    });
  });

  describe("GET /api/directory/peppol/check (checkPeppolParticipant)", () => {
    it("returns 200 and calls checkPeppolParticipant with scheme and value", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/directory/peppol/check?scheme=0088&value=123456789",
        { headers: AUTH },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "checkPeppolParticipant");
      assertEquals(call?.args[0], "0088");
      assertEquals(call?.args[1], "123456789");
    });
  });
});
