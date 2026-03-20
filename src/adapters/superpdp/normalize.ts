/**
 * SuperPDP Invoice Normalizer
 *
 * Maps common/intuitive invoice field names to the exact EN16931 field names
 * expected by SuperPDP's POST /invoices/convert endpoint.
 *
 * Same pattern as normalizeForIopole() in the Iopole adapter.
 * Principle: never overwrite fields that already exist (supports advanced users
 * passing exact EN16931 JSON while being forgiving for intuitive field names).
 *
 * @module lib/einvoice/src/adapters/superpdp/normalize
 */

// deno-lint-ignore-file no-explicit-any

/** Convert a number or string to a decimal string ("1000" → "1000.00"). */
function toDecimal(v: unknown): string {
  if (v == null) return "0.00";
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

/** Set a value only if the target key doesn't already exist and value is not null/undefined. */
function setIfAbsent(obj: any, key: string, value: unknown) {
  if (obj[key] == null && value != null) obj[key] = value;
}

/** Remove all null/undefined values from an object (shallow). */
function stripNulls(obj: any): any {
  const clean: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) clean[k] = v;
  }
  return clean;
}

/** Fields used as source for normalization — removed from output to avoid empty XML elements. */
const PARTY_SOURCE_FIELDS = ["country", "address", "siret", "siretNumber", "siren", "sirenNumber", "vatNumber", "vat_number", "vatId"];

/** Normalize a party (seller or buyer) to SuperPDP EN16931 format. */
function normalizeParty(party: any, requireElectronicAddress: boolean): any {
  if (!party || typeof party !== "object") return party;
  const p = { ...party };

  // country / address → postal_address
  if (!p.postal_address) {
    if (p.address && typeof p.address === "object") {
      p.postal_address = stripNulls({
        country_code: p.address.country_code ?? p.address.country ?? p.country ?? "FR",
        address_line1: p.address.street ?? p.address.address_line1 ?? p.address.line1,
        city: p.address.city,
        post_code: p.address.postal_code ?? p.address.post_code ?? p.address.zip,
      });
    } else if (p.country) {
      p.postal_address = { country_code: p.country };
    }
  }

  // siret → electronic_address (required for seller)
  if (!p.electronic_address && requireElectronicAddress) {
    const siret = p.siret ?? p.siretNumber;
    if (siret) {
      p.electronic_address = { scheme: "0009", value: String(siret) };
    }
  }

  // siren / siret → legal_registration_identifier
  if (!p.legal_registration_identifier) {
    const siren = p.siren ?? p.sirenNumber;
    const siret = p.siret ?? p.siretNumber;
    const id = siren ?? siret;
    if (id) {
      p.legal_registration_identifier = { scheme: "0002", value: String(id) };
    }
  }

  // vatNumber / vat_number → vat_identifier
  if (!p.vat_identifier) {
    const vat = p.vatNumber ?? p.vat_number ?? p.vatId;
    if (vat) p.vat_identifier = String(vat);
  }

  // Remove source fields to avoid empty XML elements
  for (const f of PARTY_SOURCE_FIELDS) delete p[f];

  return p;
}

/** Source fields consumed by normalizeTotals — cleaned up to avoid empty XML elements. */
const TOTALS_SOURCE_FIELDS = ["line_extension_amount", "lineTotalAmount", "tax_exclusive_amount", "taxBasisTotalAmount", "tax_inclusive_amount", "grandTotalAmount", "payableAmount"];

/** Normalize totals field names to SuperPDP EN16931 format. */
function normalizeTotals(totals: any): any {
  if (!totals || typeof totals !== "object") return totals;
  const t = { ...totals };

  // Map intuitive names → EN16931 names
  setIfAbsent(t, "sum_invoice_lines_amount", t.line_extension_amount ?? t.lineTotalAmount);
  setIfAbsent(t, "total_without_vat", t.tax_exclusive_amount ?? t.taxBasisTotalAmount);
  setIfAbsent(t, "total_with_vat", t.tax_inclusive_amount ?? t.grandTotalAmount);
  setIfAbsent(t, "amount_due_for_payment", t.payableAmount);

  // Convert simple amounts to decimal strings
  for (const key of ["sum_invoice_lines_amount", "total_without_vat", "total_with_vat", "amount_due_for_payment"]) {
    if (t[key] != null) t[key] = toDecimal(t[key]);
  }

  // total_vat_amount is an object { value, currency_code }, not a plain string
  if (t.total_vat_amount != null && typeof t.total_vat_amount !== "object") {
    t.total_vat_amount = { value: toDecimal(t.total_vat_amount) };
  } else if (t.total_vat_amount?.value != null) {
    t.total_vat_amount = { ...t.total_vat_amount, value: toDecimal(t.total_vat_amount.value) };
  }

  for (const f of TOTALS_SOURCE_FIELDS) delete t[f];
  return t;
}

/** Source fields consumed by normalizeVatBreakdown — cleaned up to avoid empty XML elements. */
const VAT_SOURCE_FIELDS = ["category_code", "categoryCode", "rate", "percent", "vat_rate", "taxable_amount", "taxableAmount", "tax_amount", "taxAmount"];

/** Normalize a single VAT breakdown entry. */
function normalizeVatBreakdown(vat: any): any {
  if (!vat || typeof vat !== "object") return vat;
  const v = { ...vat };

  setIfAbsent(v, "vat_category_code", v.category_code ?? v.categoryCode);
  setIfAbsent(v, "vat_category_rate", v.rate ?? v.percent ?? v.vat_rate);
  setIfAbsent(v, "vat_category_taxable_amount", v.taxable_amount ?? v.taxableAmount);
  setIfAbsent(v, "vat_category_tax_amount", v.tax_amount ?? v.taxAmount);

  // Decimal strings
  if (v.vat_category_rate != null) v.vat_category_rate = toDecimal(v.vat_category_rate);
  if (v.vat_category_taxable_amount != null) v.vat_category_taxable_amount = toDecimal(v.vat_category_taxable_amount);
  if (v.vat_category_tax_amount != null) v.vat_category_tax_amount = toDecimal(v.vat_category_tax_amount);

  for (const f of VAT_SOURCE_FIELDS) delete v[f];
  return v;
}

/** Source fields consumed by normalizeLine — cleaned up to avoid empty XML elements. */
const LINE_SOURCE_FIELDS = ["id", "name", "item_name", "description", "quantity", "billed_quantity", "unit_code", "unitCode", "net_price", "price", "unit_price", "unitPrice", "line_amount", "line_total_amount", "line_net_amount", "amount", "totalAmount", "tax_category", "vat_category_code", "line_vat_category_code", "vatCategoryCode", "tax_percent", "vat_rate", "line_vat_rate", "vatRate"];

/** Normalize a single invoice line. */
function normalizeLine(line: any): any {
  if (!line || typeof line !== "object") return line;
  const l = { ...line };

  // id → identifier
  setIfAbsent(l, "identifier", l.id);

  // name / item_name → item_information.name
  if (!l.item_information) {
    const name = l.name ?? l.item_name ?? l.description;
    if (name) l.item_information = { name: String(name) };
  }

  // quantity → invoiced_quantity (decimal string)
  setIfAbsent(l, "invoiced_quantity", l.quantity ?? l.billed_quantity);
  if (l.invoiced_quantity != null) l.invoiced_quantity = toDecimal(l.invoiced_quantity);

  // unit_code → invoiced_quantity_code
  setIfAbsent(l, "invoiced_quantity_code", l.unit_code ?? l.unitCode ?? "C62");

  // net_price / price → price_details.item_net_price
  if (!l.price_details) {
    const price = l.net_price ?? l.price ?? l.unit_price ?? l.unitPrice;
    if (price != null) l.price_details = { item_net_price: toDecimal(price) };
  }

  // line_amount / line_total_amount / line_net_amount → net_amount
  setIfAbsent(l, "net_amount", l.line_amount ?? l.line_total_amount ?? l.line_net_amount ?? l.amount ?? l.totalAmount);
  if (l.net_amount != null) l.net_amount = toDecimal(l.net_amount);

  // tax_category / vat info → vat_information
  if (!l.vat_information) {
    const catCode = l.tax_category ?? l.vat_category_code ?? l.line_vat_category_code ?? l.vatCategoryCode;
    const rate = l.tax_percent ?? l.vat_rate ?? l.line_vat_rate ?? l.vatRate;
    if (catCode) {
      l.vat_information = {
        invoiced_item_vat_category_code: String(catCode),
        ...(rate != null ? { invoiced_item_vat_rate: toDecimal(rate) } : {}),
      };
    }
  }

  for (const f of LINE_SOURCE_FIELDS) delete l[f];
  return l;
}

/**
 * Normalize an invoice object to SuperPDP's EN16931 format.
 *
 * Maps common/intuitive field names to the exact field names expected by
 * POST /invoices/convert?from=en16931&to=cii|ubl.
 *
 * Non-destructive: existing correctly-named fields are preserved.
 */
export function normalizeForSuperPDP(inv: Record<string, unknown>): Record<string, unknown> {
  const n: any = { ...inv };

  // Auto-add process_control if absent
  if (!n.process_control) {
    n.process_control = { specification_identifier: "urn:cen.eu:en16931:2017" };
  }

  // due_date / dueDate → payment_due_date (BR-CO-25: required when amount > 0)
  if (!n.payment_due_date) {
    const due = n.due_date ?? n.dueDate ?? n.invoiceDueDate;
    if (due) n.payment_due_date = String(due);
  }
  for (const f of ["due_date", "dueDate", "invoiceDueDate"]) delete n[f];

  // Save buyer SIRET before normalizeParty deletes source fields (needed for BR-FR-12)
  const buyerSiret = n.buyer?.siret ?? n.buyer?.siretNumber;

  // Normalize parties
  if (n.seller) n.seller = normalizeParty(n.seller, true);
  if (n.buyer) n.buyer = normalizeParty(n.buyer, false);

  // Normalize totals
  if (n.totals) n.totals = normalizeTotals(n.totals);

  // Normalize VAT breakdown — accept multiple key aliases
  let vatSource: unknown[] | undefined;
  if (Array.isArray(n.vat_break_down)) vatSource = n.vat_break_down;
  else if (Array.isArray(n.taxDetails)) vatSource = n.taxDetails;
  else if (Array.isArray(n.vatBreakdown)) vatSource = n.vatBreakdown;
  if (vatSource) {
    n.vat_break_down = vatSource.map(normalizeVatBreakdown);
    delete n.taxDetails;
    delete n.vatBreakdown;
  }

  // Normalize lines
  if (Array.isArray(n.lines)) {
    n.lines = n.lines.map(normalizeLine);
  }

  // payment_instructions: fix credit_transfer → credit_transfers (plural)
  // IBAN scheme must be "" (empty string) for SuperPDP to map to <ram:IBANID>
  if (n.payment_instructions) {
    const pi = { ...n.payment_instructions };
    if (pi.credit_transfer && !pi.credit_transfers) {
      pi.credit_transfers = Array.isArray(pi.credit_transfer) ? pi.credit_transfer : [pi.credit_transfer];
      delete pi.credit_transfer;
    }
    // Fix IBAN scheme: SuperPDP expects scheme="" for IBAN accounts
    if (Array.isArray(pi.credit_transfers)) {
      pi.credit_transfers = pi.credit_transfers.map((ct: any) => {
        if (ct?.payment_account_identifier?.scheme?.toUpperCase() === "IBAN") {
          return { ...ct, payment_account_identifier: { ...ct.payment_account_identifier, scheme: "" } };
        }
        return ct;
      });
    }
    n.payment_instructions = pi;
  }

  // PEPPOL-EN16931-R008: avoid empty ApplicableHeaderTradeDelivery
  if (!n.delivery_information) {
    n.delivery_information = { delivery_date: n.issue_date ?? new Date().toISOString().slice(0, 10) };
  }

  // BR-FR-05: French mandatory notes (PMT, PMD, AAB) — auto-add if absent
  if (!n.notes || !Array.isArray(n.notes)) n.notes = [];
  const noteCodes = new Set(n.notes.map((note: any) => note?.subject_code));
  if (!noteCodes.has("PMT")) {
    n.notes.push({ note: "En cas de retard de paiement, indemnite forfaitaire de 40 euros pour frais de recouvrement (art. L441-10 C.com).", subject_code: "PMT" });
  }
  if (!noteCodes.has("PMD")) {
    n.notes.push({ note: "Penalites de retard : 3 fois le taux d'interet legal (art. L441-10 C.com).", subject_code: "PMD" });
  }
  if (!noteCodes.has("AAB")) {
    n.notes.push({ note: "Pas d'escompte pour paiement anticipe.", subject_code: "AAB" });
  }

  // BR-FR-12: buyer electronic_address (BT-49) is mandatory in France
  if (n.buyer && !n.buyer.electronic_address) {
    const siret = buyerSiret ?? n.buyer.legal_registration_identifier?.value;
    n.buyer.electronic_address = { scheme: "0009", value: siret ?? "0000000000000" };
  }

  return n;
}
