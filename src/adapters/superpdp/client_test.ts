/**
 * SuperPDPClient Tests
 *
 * Tests for the Super PDP REST API HTTP client.
 *
 * @module lib/einvoice/src/adapters/superpdp/client_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { SuperPDPClient } from "./client.ts";
import { AdapterAPIError } from "../shared/errors.ts";
import { mockFetch } from "../../testing/helpers.ts";

function makeClient() {
  return new SuperPDPClient({
    baseUrl: "https://api.superpdp.tech/v1.beta",
    getToken: () => Promise.resolve("test-token-456"),
    timeoutMs: 5000,
  });
}

// ── Auth Header ──────────────────────────────────────────

Deno.test("SuperPDPClient - sends Bearer token in Authorization header", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const client = makeClient();
    await client.get("/invoices");

    assertEquals(captured.length, 1);
    assertEquals(captured[0].headers["authorization"], "Bearer test-token-456");
    assertEquals(captured[0].headers["accept"], "application/json");
  } finally {
    restore();
  }
});

Deno.test("SuperPDPClient - does NOT send customer-id header", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const client = makeClient();
    await client.get("/companies/me");

    assertEquals(captured[0].headers["customer-id"], undefined);
  } finally {
    restore();
  }
});

// ── GET ──────────────────────────────────────────────────

Deno.test("SuperPDPClient.get() - returns JSON body", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { id: "inv-1", status: "sent" } },
  ]);

  try {
    const client = makeClient();
    const result = await client.get("/invoices/inv-1");
    assertEquals(result, { id: "inv-1", status: "sent" });
  } finally {
    restore();
  }
});

Deno.test("SuperPDPClient.get() - passes query parameters", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const client = makeClient();
    await client.get("/invoices", { direction: "incoming", limit: 10 });

    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.get("direction"), "incoming");
    assertEquals(url.searchParams.get("limit"), "10");
  } finally {
    restore();
  }
});

// ── POST ─────────────────────────────────────────────────

Deno.test("SuperPDPClient.post() - sends JSON body", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { id: "evt-1" } },
  ]);

  try {
    const client = makeClient();
    await client.post("/invoice_events", {
      invoice_id: "inv-1",
      status_code: "fr:212",
    });

    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].headers["content-type"], "application/json");
    assertEquals(captured[0].body, {
      invoice_id: "inv-1",
      status_code: "fr:212",
    });
  } finally {
    restore();
  }
});

// ── DELETE ───────────────────────────────────────────────

Deno.test("SuperPDPClient.delete() - sends DELETE", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const client = makeClient();
    await client.delete("/directory_entries/de-1");

    assertEquals(captured[0].method, "DELETE");
    assertEquals(
      new URL(captured[0].url).pathname,
      "/v1.beta/directory_entries/de-1",
    );
  } finally {
    restore();
  }
});

// ── Download ────────────────────────────────────────────

Deno.test("SuperPDPClient.download() - returns Uint8Array and content type", async () => {
  const { restore } = mockFetch([
    { status: 200, body: "<xml>invoice</xml>", contentType: "application/xml" },
  ]);

  try {
    const client = makeClient();
    const { data, contentType } = await client.download(
      "/invoices/inv-1/download",
    );

    assertEquals(contentType, "application/xml");
    assertEquals(data.length > 0, true);
  } finally {
    restore();
  }
});

// ── Errors ──────────────────────────────────────────────

Deno.test("SuperPDPClient - throws AdapterAPIError on 4xx", async () => {
  const { restore } = mockFetch([
    { status: 404, body: { error: "not found" } },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.get("/invoices/nonexistent"),
      AdapterAPIError,
    );
  } finally {
    restore();
  }
});

Deno.test("SuperPDPClient - throws AdapterAPIError on 5xx", async () => {
  const { restore } = mockFetch([
    { status: 500, body: { error: "server error" } },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.post("/invoices", {}),
      AdapterAPIError,
    );
  } finally {
    restore();
  }
});

// ── URL Construction ─────────────────────────────────────

Deno.test("SuperPDPClient - constructs correct URLs", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const client = makeClient();
    await client.get("/companies/me");

    assertEquals(
      new URL(captured[0].url).href,
      "https://api.superpdp.tech/v1.beta/companies/me",
    );
  } finally {
    restore();
  }
});
