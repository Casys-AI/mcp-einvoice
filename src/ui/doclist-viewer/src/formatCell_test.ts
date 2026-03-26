/**
 * Unit tests for formatCell.ts
 *
 * Tests cell value formatting logic.
 * Pure TypeScript — no DOM, no React rendering.
 *
 * Note: Deno's navigator.language resolves to "en-US", so i18n defaults to
 * English and number formatting uses the "en-GB" locale.
 *
 * @module src/ui/doclist-viewer/src/formatCell_test
 */

import { assertEquals } from "jsr:@std/assert";
import { formatCell } from "./formatCell.ts";

// ── null / undefined ──────────────────────────────────────────────────────────

Deno.test("formatCell - null returns em dash", () => {
  assertEquals(formatCell(null), "—");
});

Deno.test("formatCell - undefined returns em dash", () => {
  assertEquals(formatCell(undefined), "—");
});

// ── numbers ───────────────────────────────────────────────────────────────────

Deno.test("formatCell - integer 42 formatted with 0 decimals", () => {
  const result = formatCell(42);
  // toLocaleString with 0 decimals — no decimal separator
  assertEquals(result, "42");
});

Deno.test("formatCell - decimal 42.5 formatted with 2 decimals", () => {
  const result = formatCell(42.5);
  // en-GB: "42.50"
  assertEquals(result, "42.50");
});

Deno.test("formatCell - NaN returns em dash", () => {
  assertEquals(formatCell(NaN), "—");
});

Deno.test("formatCell - Infinity returns em dash", () => {
  assertEquals(formatCell(Infinity), "—");
});

Deno.test("formatCell - negative Infinity returns em dash", () => {
  assertEquals(formatCell(-Infinity), "—");
});

Deno.test("formatCell - zero formatted as integer (0 decimals)", () => {
  assertEquals(formatCell(0), "0");
});

// ── booleans ──────────────────────────────────────────────────────────────────

Deno.test("formatCell - true returns localized yes", () => {
  // Deno resolves locale as 'en', so t('yes') = 'Yes'
  assertEquals(formatCell(true), "Yes");
});

Deno.test("formatCell - false returns localized no", () => {
  // Deno resolves locale as 'en', so t('no') = 'No'
  assertEquals(formatCell(false), "No");
});

// ── strings ───────────────────────────────────────────────────────────────────

Deno.test("formatCell - string 'hello' returns 'hello'", () => {
  assertEquals(formatCell("hello"), "hello");
});

Deno.test("formatCell - empty string returns empty string", () => {
  assertEquals(formatCell(""), "");
});

// ── objects ───────────────────────────────────────────────────────────────────

Deno.test("formatCell - plain object returns JSON stringified", () => {
  assertEquals(formatCell({ a: 1 }), '{"a":1}');
});

Deno.test("formatCell - array returns JSON stringified", () => {
  assertEquals(formatCell([1, 2, 3]), "[1,2,3]");
});
