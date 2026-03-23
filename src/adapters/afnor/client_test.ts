/**
 * AfnorClient Tests
 *
 * Tests for the AFNOR XP Z12-013 Flow API HTTP client.
 * Covers: URL construction, auth headers, multipart body (submitFlow),
 * query parameter building (searchFlows), download with optional docType,
 * and error handling.
 *
 * @module lib/einvoice/src/adapters/afnor/client_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { AfnorClient } from "./client.ts";
import { AdapterAPIError } from "../shared/errors.ts";
import { mockFetch } from "../../testing/helpers.ts";

function makeClient() {
  return new AfnorClient({
    baseUrl: "https://api.superpdp.tech/afnor-flow",
    getToken: () => Promise.resolve("test-afnor-token"),
    timeoutMs: 5000,
  });
}

// ── Auth Header ──────────────────────────────────────────

Deno.test("AfnorClient - sends Bearer token in Authorization header", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const client = makeClient();
    await client.searchFlows({});

    assertEquals(
      captured[0].headers["authorization"],
      "Bearer test-afnor-token",
    );
    assertEquals(captured[0].headers["accept"], "application/json");
  } finally {
    restore();
  }
});

// ── submitFlow — URL Construction ────────────────────────

Deno.test("AfnorClient.submitFlow() - POSTs to /v1/flows", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-1" } },
  ]);

  try {
    const client = makeClient();
    const file = new TextEncoder().encode("<Invoice/>");
    await client.submitFlow(file, { flowSyntax: "CII", name: "invoice.xml" });

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/afnor-flow/v1/flows");
  } finally {
    restore();
  }
});

// ── submitFlow — Multipart Body ──────────────────────────

Deno.test("AfnorClient.submitFlow() - multipart includes flowInfo JSON field", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-2" } },
  ]);

  try {
    const client = makeClient();
    const file = new TextEncoder().encode("<Invoice/>");
    await client.submitFlow(file, {
      flowSyntax: "CII",
      name: "invoice.xml",
      processingRule: "B2B",
    });

    // mockFetch records FormData fields as { key: stringified }
    const body = captured[0].body as Record<string, string>;
    const flowInfo = JSON.parse(body["flowInfo"]);
    assertEquals(flowInfo.flowSyntax, "CII");
    assertEquals(flowInfo.name, "invoice.xml");
    assertEquals(flowInfo.processingRule, "B2B");
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.submitFlow() - multipart includes file field with correct name", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-3" } },
  ]);

  try {
    const client = makeClient();
    const file = new TextEncoder().encode("<Invoice/>");
    await client.submitFlow(file, { flowSyntax: "CII", name: "invoice.xml" });

    const body = captured[0].body as Record<string, string>;
    // file field: [Blob: invoice.xml, N bytes]
    assertEquals(body["file"].startsWith("[Blob: invoice.xml,"), true);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.submitFlow() - falls back to 'invoice.xml' when name is omitted", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { flowId: "fl-4" } },
  ]);

  try {
    const client = makeClient();
    await client.submitFlow(new Uint8Array([1, 2, 3]), { flowSyntax: "CII" });

    const body = captured[0].body as Record<string, string>;
    assertEquals(body["file"].startsWith("[Blob: invoice.xml,"), true);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.submitFlow() - returns parsed JSON body", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { flowId: "fl-5", status: "Pending" } },
  ]);

  try {
    const client = makeClient();
    const result = await client.submitFlow(new Uint8Array([0]), {
      flowSyntax: "Factur-X",
    }) as Record<string, unknown>;
    assertEquals(result.flowId, "fl-5");
    assertEquals(result.status, "Pending");
  } finally {
    restore();
  }
});

// ── submitFlow — Error Handling ──────────────────────────

Deno.test("AfnorClient.submitFlow() - throws AdapterAPIError on 4xx", async () => {
  const { restore } = mockFetch([
    { status: 400, body: { error: "bad request" } },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.submitFlow(new Uint8Array([0]), { flowSyntax: "CII" }),
      AdapterAPIError,
    );
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.submitFlow() - throws AdapterAPIError on 5xx", async () => {
  const { restore } = mockFetch([
    { status: 503, body: "Service Unavailable" },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.submitFlow(new Uint8Array([0]), { flowSyntax: "CII" }),
      AdapterAPIError,
    );
  } finally {
    restore();
  }
});

// ── searchFlows — URL and Query Parameters ───────────────

Deno.test("AfnorClient.searchFlows() - POSTs to /v1/flows/search", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const client = makeClient();
    await client.searchFlows({});

    assertEquals(captured[0].method, "POST");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/afnor-flow/v1/flows/search");
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.searchFlows() - wraps filters in { where } body", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const client = makeClient();
    await client.searchFlows({
      flowType: ["CustomerInvoice", "SupplierInvoice"],
      trackingId: "INV-001",
    });

    const body = captured[0].body as Record<string, unknown>;
    const where = body["where"] as Record<string, unknown>;
    assertEquals(Array.isArray(where["flowType"]), true);
    assertEquals(
      (where["flowType"] as string[]).includes("CustomerInvoice"),
      true,
    );
    assertEquals(where["trackingId"], "INV-001");
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.searchFlows() - includes limit when provided", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const client = makeClient();
    await client.searchFlows({}, 25);

    const body = captured[0].body as Record<string, unknown>;
    assertEquals(body["limit"], 25);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.searchFlows() - omits limit when not provided", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const client = makeClient();
    await client.searchFlows({ trackingId: "X" });

    const body = captured[0].body as Record<string, unknown>;
    assertEquals(Object.prototype.hasOwnProperty.call(body, "limit"), false);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.searchFlows() - returns FlowSearchResult", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { results: [{ flowId: "fl-10" }], limit: 10 } },
  ]);

  try {
    const client = makeClient();
    const result = await client.searchFlows({}, 10);
    assertEquals(result.results.length, 1);
    assertEquals(result.limit, 10);
  } finally {
    restore();
  }
});

// ── downloadFlow — URL and docType ───────────────────────

Deno.test("AfnorClient.downloadFlow() - GETs /v1/flows/{flowId}", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<cii:Invoice/>", contentType: "application/xml" },
  ]);

  try {
    const client = makeClient();
    await client.downloadFlow("fl-abc");

    assertEquals(captured[0].method, "GET");
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/afnor-flow/v1/flows/fl-abc");
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.downloadFlow() - appends docType query param when provided", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<cii:Invoice/>", contentType: "application/xml" },
  ]);

  try {
    const client = makeClient();
    await client.downloadFlow("fl-abc", "Original");

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.get("docType"), "Original");
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.downloadFlow() - no docType param when not provided", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: "<cii:Invoice/>", contentType: "application/xml" },
  ]);

  try {
    const client = makeClient();
    await client.downloadFlow("fl-abc");

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.has("docType"), false);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.downloadFlow() - returns Uint8Array and content type", async () => {
  const { restore } = mockFetch([
    { status: 200, body: "<cii:Invoice/>", contentType: "application/xml" },
  ]);

  try {
    const client = makeClient();
    const { data, contentType } = await client.downloadFlow("fl-1");
    assertEquals(contentType, "application/xml");
    assertEquals(data.length > 0, true);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.downloadFlow() - throws AdapterAPIError on 404", async () => {
  const { restore } = mockFetch([
    { status: 404, body: { error: "not found" } },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.downloadFlow("nonexistent"),
      AdapterAPIError,
    );
  } finally {
    restore();
  }
});

// ── healthcheck ──────────────────────────────────────────

Deno.test("AfnorClient.healthcheck() - returns true on 200", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { status: "ok" } },
  ]);

  try {
    const client = makeClient();
    const result = await client.healthcheck();
    assertEquals(result, true);
  } finally {
    restore();
  }
});

Deno.test("AfnorClient.healthcheck() - returns false on 5xx", async () => {
  const { restore } = mockFetch([
    { status: 503, body: "down" },
  ]);

  try {
    const client = makeClient();
    const result = await client.healthcheck();
    assertEquals(result, false);
  } finally {
    restore();
  }
});

// ── URL Construction ─────────────────────────────────────

Deno.test("AfnorClient - constructs correct full URL", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { results: [] } },
  ]);

  try {
    const client = makeClient();
    await client.searchFlows({});

    assertEquals(
      new URL(captured[0].url).href,
      "https://api.superpdp.tech/afnor-flow/v1/flows/search",
    );
  } finally {
    restore();
  }
});
