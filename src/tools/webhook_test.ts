/**
 * Webhook Tools Tests
 *
 * @module lib/einvoice/src/tools/webhook_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { webhookTools } from "./webhook.ts";
import { createMockAdapter } from "../testing/helpers.ts";

function findTool(name: string) {
  const tool = webhookTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("einvoice_webhook_list - calls adapter.listWebhooks", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_webhook_list");

  await tool.handler({}, { adapter });

  assertEquals(calls[0].method, "listWebhooks");
});

Deno.test("einvoice_webhook_get - throws without id", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_webhook_get");

  await assertRejects(() => tool.handler({}, { adapter }), Error, "'id' is required");
});

Deno.test("einvoice_webhook_create - maps all fields", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_webhook_create");

  await tool.handler({
    url: "https://example.com/hook",
    events: ["invoice.received"],
    name: "Test Hook",
    active: true,
  }, { adapter });

  assertEquals(calls[0].method, "createWebhook");
  const arg = calls[0].args[0] as Record<string, unknown>;
  assertEquals(arg.url, "https://example.com/hook");
  assertEquals(arg.events, ["invoice.received"]);
  assertEquals(arg.name, "Test Hook");
  assertEquals(arg.active, true);
});

Deno.test("einvoice_webhook_create - throws without required fields", async () => {
  const { adapter } = createMockAdapter();
  const tool = findTool("einvoice_webhook_create");

  await assertRejects(() => tool.handler({ url: "https://x.com" }, { adapter }), Error);
  await assertRejects(() => tool.handler({ events: ["x"] }, { adapter }), Error);
});

Deno.test("einvoice_webhook_update - maps id and body", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_webhook_update");

  await tool.handler({ id: "wh-1", url: "https://new.com", active: false }, { adapter });

  assertEquals(calls[0].method, "updateWebhook");
  assertEquals(calls[0].args[0], "wh-1");
  const body = calls[0].args[1] as Record<string, unknown>;
  assertEquals(body.url, "https://new.com");
  assertEquals(body.active, false);
});

Deno.test("einvoice_webhook_delete - calls adapter.deleteWebhook", async () => {
  const { adapter, calls } = createMockAdapter();
  const tool = findTool("einvoice_webhook_delete");

  await tool.handler({ id: "wh-1" }, { adapter });

  assertEquals(calls[0].method, "deleteWebhook");
  assertEquals(calls[0].args[0], "wh-1");
});

Deno.test("einvoice_webhook_list has doclist-viewer UI", () => {
  const tool = findTool("einvoice_webhook_list");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-einvoice/doclist-viewer");
});
