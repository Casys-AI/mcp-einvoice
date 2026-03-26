/**
 * Unit tests for format.ts
 *
 * Tests address formatting logic.
 * Pure TypeScript — no DOM, no React rendering.
 *
 * @module src/ui/shared/format_test
 */

import { assertEquals } from "jsr:@std/assert";
import { formatAddress } from "./format.ts";

// ── full address ──────────────────────────────────────────────────────────────

Deno.test("formatAddress - full address object returns comma-separated string", () => {
  assertEquals(
    formatAddress({
      street: "12 rue de la Paix",
      postalCode: "75001",
      city: "Paris",
      country: "FR",
    }),
    "12 rue de la Paix, 75001 Paris, FR",
  );
});

// ── partial addresses ─────────────────────────────────────────────────────────

Deno.test("formatAddress - missing city only shows postalCode in middle segment", () => {
  assertEquals(
    formatAddress({
      street: "12 rue de la Paix",
      postalCode: "75001",
      country: "FR",
    }),
    "12 rue de la Paix, 75001, FR",
  );
});

Deno.test("formatAddress - missing postalCode only shows city in middle segment", () => {
  assertEquals(
    formatAddress({ street: "12 rue de la Paix", city: "Paris", country: "FR" }),
    "12 rue de la Paix, Paris, FR",
  );
});

Deno.test("formatAddress - missing street skips that part", () => {
  assertEquals(
    formatAddress({ postalCode: "75001", city: "Paris", country: "FR" }),
    "75001 Paris, FR",
  );
});

Deno.test("formatAddress - missing country skips that part", () => {
  assertEquals(
    formatAddress({
      street: "12 rue de la Paix",
      postalCode: "75001",
      city: "Paris",
    }),
    "12 rue de la Paix, 75001 Paris",
  );
});

Deno.test("formatAddress - only city provided", () => {
  assertEquals(formatAddress({ city: "Paris" }), "Paris");
});

Deno.test("formatAddress - only country provided", () => {
  assertEquals(formatAddress({ country: "FR" }), "FR");
});

// ── empty / null-like ─────────────────────────────────────────────────────────

Deno.test("formatAddress - empty object returns em dash", () => {
  assertEquals(formatAddress({}), "—");
});

Deno.test("formatAddress - all undefined fields returns em dash", () => {
  assertEquals(
    formatAddress({
      street: undefined,
      city: undefined,
      postalCode: undefined,
      country: undefined,
    }),
    "—",
  );
});
