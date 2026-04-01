import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { createApp } from "../app.ts";
import { createMockAdapter } from "@casys/einvoice-core";

const AUTH = { Authorization: "Bearer test-key" };

describe("Config/Entity/Identifier routes", () => {
  describe("GET /api/config/customer-id (getCustomerId)", () => {
    it("returns 200 and calls getCustomerId", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/config/customer-id", {
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "getCustomerId");
    });
  });

  describe("GET /api/entities (listBusinessEntities)", () => {
    it("returns 200 and calls listBusinessEntities", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities", { headers: AUTH });
      assertEquals(res.status, 200);
      assertEquals(calls.at(-1)?.method, "listBusinessEntities");
    });
  });

  describe("POST /api/entities/legal-unit (createLegalUnit)", () => {
    it("returns 200 and calls createLegalUnit with data", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/legal-unit", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ACME SA", siren: "123456789" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "createLegalUnit");
      const args = call?.args[0] as Record<string, unknown>;
      assertEquals(args.name, "ACME SA");
      assertEquals(args.siren, "123456789");
    });
  });

  describe("POST /api/entities/office (createOffice)", () => {
    it("returns 200 and calls createOffice with data", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/office", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Paris Office" }),
      });
      assertEquals(res.status, 200);
      assertEquals(calls.find((c) => c.method === "createOffice")?.method, "createOffice");
    });
  });

  describe("POST /api/entities/claim-by-identifier (claimBusinessEntityByIdentifier)", () => {
    it("returns 200 and calls claimBusinessEntityByIdentifier", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/claim-by-identifier", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ scheme: "siret", value: "12345678900010" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find(
        (c) => c.method === "claimBusinessEntityByIdentifier",
      );
      assertEquals(call?.args[0], "siret");
      assertEquals(call?.args[1], "12345678900010");
    });
  });

  describe("POST /api/entities/enroll/french (enrollFrench)", () => {
    it("returns 200 and calls enrollFrench", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/enroll/french", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: "ent-1" }),
      });
      assertEquals(res.status, 200);
      assertEquals(calls.find((c) => c.method === "enrollFrench")?.method, "enrollFrench");
    });
  });

  describe("POST /api/entities/enroll/international (enrollInternational)", () => {
    it("returns 200 and calls enrollInternational", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/enroll/international", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: "ent-2" }),
      });
      assertEquals(res.status, 200);
      assertEquals(
        calls.find((c) => c.method === "enrollInternational")?.method,
        "enrollInternational",
      );
    });
  });

  describe("GET /api/entities/{id} (getBusinessEntity)", () => {
    it("returns 200 and calls getBusinessEntity with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/ent-42", { headers: AUTH });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "getBusinessEntity");
      assertEquals(call?.args[0], "ent-42");
    });
  });

  describe("DELETE /api/entities/{id} (deleteBusinessEntity)", () => {
    it("returns 200 and calls deleteBusinessEntity with id", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/ent-7", {
        method: "DELETE",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "deleteBusinessEntity");
      assertEquals(call?.args[0], "ent-7");
    });
  });

  describe("PUT /api/entities/{id}/configure (configureBusinessEntity)", () => {
    it("returns 200 and calls configureBusinessEntity", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/ent-8/configure", {
        method: "PUT",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ setting: "value" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "configureBusinessEntity");
      assertEquals(call?.args[0], "ent-8");
    });
  });

  describe("POST /api/entities/{id}/claim (claimBusinessEntity)", () => {
    it("returns 200 and calls claimBusinessEntity", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/ent-9/claim", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ proof: "token-abc" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "claimBusinessEntity");
      assertEquals(call?.args[0], "ent-9");
    });
  });

  describe("DELETE /api/entities/{entityId}/claim (deleteClaim)", () => {
    it("returns 200 and calls deleteClaim with entityId", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/ent-3/claim", {
        method: "DELETE",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "deleteClaim");
      assertEquals(call?.args[0], "ent-3");
    });
  });

  describe("POST /api/entities/{entityId}/identifiers (createIdentifier)", () => {
    it("returns 200 and calls createIdentifier with entityId", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/entities/ent-5/identifiers", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ scheme: "siret", value: "12345678900010" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "createIdentifier");
      assertEquals(call?.args[0], "ent-5");
    });
  });

  describe("POST /api/identifiers/by-scheme (createIdentifierByScheme)", () => {
    it("returns 200 and calls createIdentifierByScheme", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/identifiers/by-scheme", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ scheme: "siret", value: "98765432100011" }),
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "createIdentifierByScheme");
      assertEquals(call?.args[0], "siret");
      assertEquals(call?.args[1], "98765432100011");
    });
  });

  describe("POST /api/identifiers/register-network-by-scheme (registerNetworkByScheme)", () => {
    it("returns 200 and calls registerNetworkByScheme", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/identifiers/register-network-by-scheme",
        {
          method: "POST",
          headers: { ...AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({
            scheme: "siret",
            value: "12345678900010",
            network: "PPF",
          }),
        },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "registerNetworkByScheme");
      assertEquals(call?.args[0], "siret");
      assertEquals(call?.args[1], "12345678900010");
      assertEquals(call?.args[2], "PPF");
    });
  });

  describe("POST /api/identifiers/{identifierId}/register-network (registerNetwork)", () => {
    it("returns 200 and calls registerNetwork with identifierId and network", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request(
        "/api/identifiers/id-123/register-network",
        {
          method: "POST",
          headers: { ...AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ network: "PEPPOL" }),
        },
      );
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "registerNetwork");
      assertEquals(call?.args[0], "id-123");
      assertEquals(call?.args[1], "PEPPOL");
    });
  });

  describe("DELETE /api/identifiers/network/{directoryId} (unregisterNetwork)", () => {
    it("returns 200 and calls unregisterNetwork with directoryId", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/identifiers/network/dir-55", {
        method: "DELETE",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "unregisterNetwork");
      assertEquals(call?.args[0], "dir-55");
    });
  });

  describe("DELETE /api/identifiers/{identifierId} (deleteIdentifier)", () => {
    it("returns 200 and calls deleteIdentifier with identifierId", async () => {
      const { adapter, calls } = createMockAdapter();
      const app = createApp(adapter, "test-key");

      const res = await app.request("/api/identifiers/idf-77", {
        method: "DELETE",
        headers: AUTH,
      });
      assertEquals(res.status, 200);
      const call = calls.find((c) => c.method === "deleteIdentifier");
      assertEquals(call?.args[0], "idf-77");
    });
  });
});
