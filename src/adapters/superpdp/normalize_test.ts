/**
 * SuperPDP Normalizer Tests
 *
 * Verifies that normalizeForSuperPDP() correctly maps intuitive field names
 * to the exact EN16931 field names expected by SuperPDP's convert API.
 *
 * @module lib/einvoice/src/adapters/superpdp/normalize_test
 */

import { assertEquals } from "jsr:@std/assert";
import { normalizeForSuperPDP } from "./normalize.ts";

// ── process_control ─────────────────────────────────────

Deno.test("normalizeForSuperPDP - auto-adds process_control if absent", () => {
  const result = normalizeForSuperPDP({ number: "INV-001" });
  // deno-lint-ignore no-explicit-any
  assertEquals(
    (result as any).process_control.specification_identifier,
    "urn:cen.eu:en16931:2017",
  );
});

Deno.test("normalizeForSuperPDP - preserves existing process_control", () => {
  const result = normalizeForSuperPDP({
    process_control: { specification_identifier: "custom:spec" },
  });
  // deno-lint-ignore no-explicit-any
  assertEquals(
    (result as any).process_control.specification_identifier,
    "custom:spec",
  );
});

// ── Seller normalization ────────────────────────────────

Deno.test("normalizeForSuperPDP - seller.country → postal_address", () => {
  const result = normalizeForSuperPDP({
    seller: { name: "ACME", country: "FR" },
  });
  // deno-lint-ignore no-explicit-any
  assertEquals((result as any).seller.postal_address, { country_code: "FR" });
});

Deno.test("normalizeForSuperPDP - seller.address object → postal_address", () => {
  const result = normalizeForSuperPDP({
    seller: {
      name: "ACME",
      address: {
        street: "1 rue X",
        city: "Paris",
        postal_code: "75001",
        country: "FR",
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const pa = (result as any).seller.postal_address;
  assertEquals(pa.country_code, "FR");
  assertEquals(pa.city, "Paris");
  assertEquals(pa.address_line1, "1 rue X");
  assertEquals(pa.post_code, "75001");
});

Deno.test("normalizeForSuperPDP - seller.siret → electronic_address", () => {
  const result = normalizeForSuperPDP({
    seller: { name: "ACME", siret: "12345678901234", country: "FR" },
  });
  // deno-lint-ignore no-explicit-any
  assertEquals((result as any).seller.electronic_address, {
    scheme: "0009",
    value: "12345678901234",
  });
});

Deno.test("normalizeForSuperPDP - seller.siren → legal_registration_identifier", () => {
  const result = normalizeForSuperPDP({
    seller: { name: "ACME", siren: "123456789", country: "FR" },
  });
  // deno-lint-ignore no-explicit-any
  assertEquals((result as any).seller.legal_registration_identifier, {
    scheme: "0002",
    value: "123456789",
  });
});

Deno.test("normalizeForSuperPDP - seller.vatNumber → vat_identifier", () => {
  const result = normalizeForSuperPDP({
    seller: { name: "ACME", vatNumber: "FR32123456789", country: "FR" },
  });
  // deno-lint-ignore no-explicit-any
  assertEquals((result as any).seller.vat_identifier, "FR32123456789");
});

Deno.test("normalizeForSuperPDP - preserves existing seller.postal_address", () => {
  const result = normalizeForSuperPDP({
    seller: {
      name: "ACME",
      postal_address: { country_code: "DE" },
      country: "FR",
    },
  });
  // deno-lint-ignore no-explicit-any
  assertEquals((result as any).seller.postal_address, { country_code: "DE" });
});

// ── Totals normalization ────────────────────────────────

Deno.test("normalizeForSuperPDP - maps totals field names", () => {
  const result = normalizeForSuperPDP({
    totals: {
      line_extension_amount: 1000,
      tax_exclusive_amount: 1000,
      tax_inclusive_amount: 1200,
      amount_due_for_payment: 1200,
    },
  });
  // deno-lint-ignore no-explicit-any
  const t = (result as any).totals;
  assertEquals(t.sum_invoice_lines_amount, "1000.00");
  assertEquals(t.total_without_vat, "1000.00");
  assertEquals(t.total_with_vat, "1200.00");
  assertEquals(t.amount_due_for_payment, "1200.00");
});

Deno.test("normalizeForSuperPDP - totals converts numbers to decimal strings", () => {
  const result = normalizeForSuperPDP({
    totals: {
      sum_invoice_lines_amount: 500,
      total_without_vat: 500,
      total_with_vat: 600,
      amount_due_for_payment: 600,
    },
  });
  // deno-lint-ignore no-explicit-any
  const t = (result as any).totals;
  assertEquals(t.sum_invoice_lines_amount, "500.00");
  assertEquals(t.amount_due_for_payment, "600.00");
});

// ── VAT breakdown normalization ─────────────────────────

Deno.test("normalizeForSuperPDP - maps vat_break_down field names", () => {
  const result = normalizeForSuperPDP({
    vat_break_down: [{
      taxable_amount: 1000,
      tax_amount: 200,
      category_code: "S",
      rate: 20,
    }],
  });
  // deno-lint-ignore no-explicit-any
  const v = (result as any).vat_break_down[0];
  assertEquals(v.vat_category_code, "S");
  assertEquals(v.vat_category_rate, "20.00");
  assertEquals(v.vat_category_taxable_amount, "1000.00");
  assertEquals(v.vat_category_tax_amount, "200.00");
});

Deno.test("normalizeForSuperPDP - accepts taxDetails as alias", () => {
  const result = normalizeForSuperPDP({
    taxDetails: [{
      category_code: "S",
      taxable_amount: 500,
      tax_amount: 100,
      percent: 20,
    }],
  });
  // deno-lint-ignore no-explicit-any
  const v = (result as any).vat_break_down[0];
  assertEquals(v.vat_category_code, "S");
  assertEquals(v.vat_category_rate, "20.00");
});

// ── Lines normalization ─────────────────────────────────

Deno.test("normalizeForSuperPDP - maps line fields", () => {
  const result = normalizeForSuperPDP({
    lines: [{
      id: "1",
      name: "Widget",
      quantity: 10,
      unit_code: "EA",
      net_price: 100,
      line_amount: 1000,
      tax_category: "S",
      tax_percent: 20,
    }],
  });
  // deno-lint-ignore no-explicit-any
  const l = (result as any).lines[0];
  assertEquals(l.identifier, "1");
  assertEquals(l.item_information, { name: "Widget" });
  assertEquals(l.invoiced_quantity, "10.00");
  assertEquals(l.invoiced_quantity_code, "EA");
  assertEquals(l.price_details, { item_net_price: "100.00" });
  assertEquals(l.net_amount, "1000.00");
  assertEquals(l.vat_information.invoiced_item_vat_category_code, "S");
  assertEquals(l.vat_information.invoiced_item_vat_rate, "20.00");
});

Deno.test("normalizeForSuperPDP - preserves existing item_information", () => {
  const result = normalizeForSuperPDP({
    lines: [{
      identifier: "1",
      item_information: { name: "Custom", description: "Detailed" },
      name: "Ignored",
    }],
  });
  // deno-lint-ignore no-explicit-any
  const l = (result as any).lines[0];
  assertEquals(l.item_information.name, "Custom");
  assertEquals(l.item_information.description, "Detailed");
});

Deno.test("normalizeForSuperPDP - defaults unit_code to C62", () => {
  const result = normalizeForSuperPDP({
    lines: [{
      id: "1",
      name: "X",
      quantity: 1,
      net_price: 10,
      line_amount: 10,
    }],
  });
  // deno-lint-ignore no-explicit-any
  assertEquals((result as any).lines[0].invoiced_quantity_code, "C62");
});

// ── Full round-trip ─────────────────────────────────────

Deno.test("normalizeForSuperPDP - complete intuitive invoice → valid EN16931", () => {
  const result = normalizeForSuperPDP({
    number: "INV-001",
    issue_date: "2026-03-20",
    type_code: 380,
    currency_code: "EUR",
    seller: {
      name: "Burger Queen",
      siret: "43446637100011",
      siren: "434466371",
      vatNumber: "FR32434466371",
      country: "FR",
    },
    buyer: { name: "Test Corp", siret: "12345678900010", country: "FR" },
    totals: {
      line_extension_amount: 500,
      tax_exclusive_amount: 500,
      tax_inclusive_amount: 600,
      amount_due_for_payment: 600,
    },
    vat_break_down: [{
      taxable_amount: 500,
      tax_amount: 100,
      category_code: "S",
      rate: 20,
    }],
    lines: [{
      id: "1",
      name: "Burger x50",
      quantity: 50,
      unit_code: "C62",
      net_price: 10,
      line_amount: 500,
      tax_category: "S",
      tax_percent: 20,
    }],
  });

  // deno-lint-ignore no-explicit-any
  const r = result as any;
  // process_control auto-added
  assertEquals(
    r.process_control.specification_identifier,
    "urn:cen.eu:en16931:2017",
  );
  // seller normalized
  assertEquals(r.seller.electronic_address, {
    scheme: "0009",
    value: "43446637100011",
  });
  assertEquals(r.seller.legal_registration_identifier, {
    scheme: "0002",
    value: "434466371",
  });
  assertEquals(r.seller.vat_identifier, "FR32434466371");
  assertEquals(r.seller.postal_address.country_code, "FR");
  // buyer normalized
  assertEquals(r.buyer.postal_address.country_code, "FR");
  // totals as decimal strings
  assertEquals(r.totals.sum_invoice_lines_amount, "500.00");
  assertEquals(r.totals.total_with_vat, "600.00");
  // vat breakdown
  assertEquals(r.vat_break_down[0].vat_category_code, "S");
  // lines
  assertEquals(r.lines[0].identifier, "1");
  assertEquals(r.lines[0].item_information.name, "Burger x50");
  assertEquals(r.lines[0].price_details.item_net_price, "10.00");
});
