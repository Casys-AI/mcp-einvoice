/**
 * Tools Registry Tests
 *
 * Tests for the tool registry (mod.ts) — all categories, lookups, no duplicates.
 *
 * @module lib/einvoice/src/tools/mod_test
 */

import { assertEquals } from "jsr:@std/assert";
import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./mod.ts";

Deno.test("allTools contains the expected number of tools", () => {
  // 11 invoice + 3 directory + 2 status + 2 reporting + 5 webhook + 16 config = 39
  assertEquals(allTools.length, 39);
});

Deno.test("toolsByCategory has all 6 categories", () => {
  const cats = Object.keys(toolsByCategory);
  assertEquals(cats.length, 6);
  assertEquals(cats.includes("invoice"), true);
  assertEquals(cats.includes("directory"), true);
  assertEquals(cats.includes("status"), true);
  assertEquals(cats.includes("reporting"), true);
  assertEquals(cats.includes("webhook"), true);
  assertEquals(cats.includes("config"), true);
});

Deno.test("category tool counts are correct", () => {
  assertEquals(toolsByCategory["invoice"].length, 11);
  assertEquals(toolsByCategory["directory"].length, 3);
  assertEquals(toolsByCategory["status"].length, 2);
  assertEquals(toolsByCategory["reporting"].length, 2);
  assertEquals(toolsByCategory["webhook"].length, 5);
  assertEquals(toolsByCategory["config"].length, 16);
});

Deno.test("getToolsByCategory returns correct tools", () => {
  assertEquals(getToolsByCategory("invoice").length, 11);
  assertEquals(getToolsByCategory("config").length, 16);
  assertEquals(getToolsByCategory("nonexistent").length, 0);
});

Deno.test("getToolByName finds existing tools", () => {
  const tool = getToolByName("einvoice_invoice_get");
  assertEquals(tool?.name, "einvoice_invoice_get");
  assertEquals(tool?.category, "invoice");
});

Deno.test("getToolByName returns undefined for unknown", () => {
  assertEquals(getToolByName("nonexistent"), undefined);
});

Deno.test("getCategories returns all categories", () => {
  const cats = getCategories();
  assertEquals(cats.length, 6);
});

Deno.test("no duplicate tool names across all categories", () => {
  const seen = new Set<string>();
  for (const tool of allTools) {
    assertEquals(seen.has(tool.name), false, `Duplicate tool: ${tool.name}`);
    seen.add(tool.name);
  }
});

Deno.test("all tools have einvoice_ prefix", () => {
  for (const tool of allTools) {
    assertEquals(
      tool.name.startsWith("einvoice_"),
      true,
      `Tool ${tool.name} missing einvoice_ prefix`,
    );
  }
});

Deno.test("all tools have handler function", () => {
  for (const tool of allTools) {
    assertEquals(
      typeof tool.handler,
      "function",
      `${tool.name} missing handler`,
    );
  }
});

Deno.test("all tools have requires array", () => {
  for (const tool of allTools) {
    assertEquals(
      Array.isArray(tool.requires) && tool.requires.length > 0,
      true,
      `Tool ${tool.name} missing requires`,
    );
  }
});
