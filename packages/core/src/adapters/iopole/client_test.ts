/**
 * IopoleClient Tests
 *
 * Tests for the Iopole REST API HTTP client.
 *
 * @module lib/einvoice/src/api/iopole-client_test
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import {
  createOAuth2TokenProvider,
  IopoleClient,
} from "./client.ts";
import { AdapterAPIError } from "../shared/errors.ts";
import { mockFetch } from "../../testing/helpers.ts";

const TEST_CUSTOMER_ID = "test-customer-id";

function makeClient() {
  return new IopoleClient({
    baseUrl: "https://api.ppd.iopole.fr/v1",
    customerId: TEST_CUSTOMER_ID,
    getToken: () => Promise.resolve("test-token-123"),
    timeoutMs: 5000,
  });
}

// ── Auth Header ──────────────────────────────────────────

Deno.test("IopoleClient - sends Bearer token in Authorization header", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const client = makeClient();
    await client.get("/invoice/search");

    assertEquals(captured.length, 1);
    assertEquals(captured[0].headers["authorization"], "Bearer test-token-123");
    assertEquals(captured[0].headers["accept"], "application/json");
  } finally {
    restore();
  }
});

Deno.test("IopoleClient - sends customer-id header on all requests", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const client = makeClient();
    await client.get("/invoice/search");

    assertEquals(captured[0].headers["customer-id"], TEST_CUSTOMER_ID);
  } finally {
    restore();
  }
});

// ── GET ──────────────────────────────────────────────────

Deno.test("IopoleClient.get() - returns JSON body", async () => {
  const { restore } = mockFetch([
    { status: 200, body: { invoices: [{ id: "abc" }] } },
  ]);

  try {
    const client = makeClient();
    const result = await client.get("/invoice/search");
    assertEquals(result, { invoices: [{ id: "abc" }] });
  } finally {
    restore();
  }
});

Deno.test("IopoleClient.get() - passes query parameters", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const client = makeClient();
    await client.get("/invoice/search", {
      status: "accepted",
      page: 0,
      size: 20,
      missing: undefined,
    });

    assertEquals(captured.length, 1);
    const url = new URL(captured[0].url);
    assertEquals(url.searchParams.get("status"), "accepted");
    assertEquals(url.searchParams.get("page"), "0");
    assertEquals(url.searchParams.get("size"), "20");
    assertEquals(url.searchParams.get("missing"), null);
  } finally {
    restore();
  }
});

// ── getV11 ──────────────────────────────────────────────

Deno.test("IopoleClient.getV11() - uses /v1.1 base URL", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { data: [] } },
  ]);

  try {
    const client = makeClient();
    await client.getV11("/invoice/search", { q: "test" });

    assertEquals(captured.length, 1);
    const url = new URL(captured[0].url);
    assertEquals(url.pathname, "/v1.1/invoice/search");
    assertEquals(url.searchParams.get("q"), "test");
  } finally {
    restore();
  }
});

Deno.test("IopoleClient.getV11() - does not mutate config.baseUrl", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
    { status: 200, body: {} },
  ]);

  try {
    const client = makeClient();
    // Call getV11, then regular get — baseUrl must remain /v1
    await client.getV11("/invoice/search");
    await client.get("/invoice/other");

    assertEquals(captured.length, 2);
    const url0 = new URL(captured[0].url);
    const url1 = new URL(captured[1].url);
    assertEquals(url0.pathname, "/v1.1/invoice/search");
    assertEquals(url1.pathname, "/v1/invoice/other");
  } finally {
    restore();
  }
});

// ── POST ─────────────────────────────────────────────────

Deno.test("IopoleClient.post() - sends JSON body", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { guid: "new-uuid" } },
  ]);

  try {
    const client = makeClient();
    const result = await client.post("/invoice/emit", {
      invoice: { number: "F-001" },
    });

    assertEquals(result, { guid: "new-uuid" });
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].headers["content-type"], "application/json");
    assertEquals(captured[0].body, { invoice: { number: "F-001" } });
  } finally {
    restore();
  }
});

Deno.test("IopoleClient.post() - works without body", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { ok: true } },
  ]);

  try {
    const client = makeClient();
    await client.post("/invoice/abc/seen");

    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].body, null);
  } finally {
    restore();
  }
});

// ── PUT ──────────────────────────────────────────────────

Deno.test("IopoleClient.put() - sends PUT with body", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { updated: true } },
  ]);

  try {
    const client = makeClient();
    await client.put("/business-entity/123", { name: "Updated Corp" });

    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].body, { name: "Updated Corp" });
  } finally {
    restore();
  }
});

// ── DELETE ────────────────────────────────────────────────

Deno.test("IopoleClient.delete() - sends DELETE", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: { deleted: true } },
  ]);

  try {
    const client = makeClient();
    await client.delete("/business-entity/123");

    assertEquals(captured[0].method, "DELETE");
  } finally {
    restore();
  }
});

// ── postBinary ──────────────────────────────────────────

Deno.test("IopoleClient.postBinary() - returns binary data with content type", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // Verify it sends JSON body + auth headers (keys are case-sensitive from spread)
    assertEquals(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer test-token-123");
    assertEquals(headers["customer-id"], TEST_CUSTOMER_ID);
    assertEquals(headers["Content-Type"], "application/json");
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    return new Response(pdfBytes, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });
  };

  try {
    const client = makeClient();
    const { data, contentType } = await client.postBinary(
      "/tools/facturx/generate",
      { invoice: {} },
      { flavor: "EN16931", language: "fr" },
    );
    assertEquals(contentType, "application/pdf");
    assertEquals(data.length, 4);
    assertEquals(data[0], 0x25);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("IopoleClient.postBinary() - throws AdapterAPIError on failure", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    return new Response("Bad Request", { status: 400 });
  };

  try {
    const client = makeClient();
    await assertRejects(
      () => client.postBinary("/tools/facturx/generate", {}, {}),
      AdapterAPIError,
    );
  } finally {
    globalThis.fetch = original;
  }
});

// ── upload ───────────────────────────────────────────────

Deno.test("IopoleClient.upload() - sends multipart FormData", async () => {
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  let capturedBody: any = null;

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    assertEquals(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer test-token-123");
    assertEquals(headers["customer-id"], TEST_CUSTOMER_ID);
    // Content-Type must NOT be set (fetch adds boundary automatically)
    assertEquals(headers["Content-Type"], undefined);
    capturedBody = init?.body as FormData;
    return new Response(JSON.stringify({ invoiceId: "inv-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = makeClient();
    const file = new Uint8Array([1, 2, 3]);
    const result = await client.upload("/invoice", file, "test.pdf");
    assertEquals(result, { invoiceId: "inv-1" });
    // Verify FormData was sent
    assert(capturedBody instanceof FormData);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("IopoleClient.upload() - throws AdapterAPIError on failure", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    return new Response("Forbidden", { status: 403 });
  };

  try {
    const client = makeClient();
    await assertRejects(
      () => client.upload("/invoice", new Uint8Array([1]), "test.pdf"),
      AdapterAPIError,
    );
  } finally {
    globalThis.fetch = original;
  }
});

// ── Download ─────────────────────────────────────────────

Deno.test("IopoleClient.download() - returns Uint8Array and content type", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    const body = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });
  };

  try {
    const client = makeClient();
    const { data, contentType } = await client.download(
      "/invoice/abc/readable",
    );

    assertEquals(contentType, "application/pdf");
    assertEquals(data.length, 4);
    assertEquals(data[0], 0x25); // %
  } finally {
    globalThis.fetch = original;
  }
});

// ── Error Handling ───────────────────────────────────────

Deno.test("IopoleClient - throws AdapterAPIError on 4xx", async () => {
  const { restore } = mockFetch([
    { status: 401, body: { error: "Unauthorized" } },
  ]);

  try {
    const client = makeClient();
    const err = await assertRejects(
      () => client.get("/invoice/search"),
      AdapterAPIError,
    );
    assertEquals(err.status, 401);
  } finally {
    restore();
  }
});

Deno.test("IopoleClient - throws AdapterAPIError on 5xx", async () => {
  const { restore } = mockFetch([
    { status: 500, body: { error: "Internal Server Error" } },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.post("/invoice/emit", { invoice: {} }),
      AdapterAPIError,
    );
  } finally {
    restore();
  }
});

Deno.test("IopoleClient.download() - throws on error response", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  };

  try {
    const client = makeClient();
    await assertRejects(
      () => client.download("/invoice/nonexistent/readable"),
      AdapterAPIError,
    );
  } finally {
    globalThis.fetch = original;
  }
});

// ── URL Construction ─────────────────────────────────────

Deno.test("IopoleClient - constructs correct URLs", async () => {
  const { restore, captured } = mockFetch([
    { status: 200, body: {} },
  ]);

  try {
    const client = makeClient();
    await client.get("/invoice/abc-def");

    assertEquals(
      captured[0].url,
      "https://api.ppd.iopole.fr/v1/invoice/abc-def",
    );
  } finally {
    restore();
  }
});

// ── OAuth2 Token Provider ───────────────────────────────

Deno.test("createOAuth2TokenProvider - fetches and caches token", async () => {
  let fetchCount = 0;
  const original = globalThis.fetch;

  globalThis.fetch = async (_url: string | URL | Request): Promise<Response> => {
    fetchCount++;
    return new Response(
      JSON.stringify({
        access_token: "oauth-token-abc",
        expires_in: 600,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const getToken = createOAuth2TokenProvider({
      authUrl:
        "https://auth.iopole.com/realms/iopole/protocol/openid-connect/token",
      clientId: "test-client",
      clientSecret: "test-secret",
    });

    const token1 = await getToken();
    assertEquals(token1, "oauth-token-abc");
    assertEquals(fetchCount, 1);

    // Second call should use cache
    const token2 = await getToken();
    assertEquals(token2, "oauth-token-abc");
    assertEquals(fetchCount, 1);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("createOAuth2TokenProvider - sends correct form data", async () => {
  let capturedBody = "";
  const original = globalThis.fetch;

  globalThis.fetch = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    capturedBody = init?.body as string ?? "";
    return new Response(
      JSON.stringify({
        access_token: "tok",
        expires_in: 600,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const getToken = createOAuth2TokenProvider({
      authUrl: "https://auth.example.com/token",
      clientId: "my-id",
      clientSecret: "my-secret",
    });

    await getToken();

    const params = new URLSearchParams(capturedBody);
    assertEquals(params.get("grant_type"), "client_credentials");
    assertEquals(params.get("client_id"), "my-id");
    assertEquals(params.get("client_secret"), "my-secret");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("createOAuth2TokenProvider - throws on auth failure", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    return new Response("Unauthorized", { status: 401 });
  };

  try {
    const getToken = createOAuth2TokenProvider({
      authUrl: "https://auth.example.com/token",
      clientId: "bad-id",
      clientSecret: "bad-secret",
    });

    await assertRejects(
      () => getToken(),
      Error,
      "Token request failed: 401",
    );
  } finally {
    globalThis.fetch = original;
  }
});
