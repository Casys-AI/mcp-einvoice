import { assertEquals } from "jsr:@std/assert";
import {
  classifyColumns,
  colWidth,
  isDirectionField,
  isStatusField,
} from "./columnUtils.ts";

// ── classifyColumns ───────────────────────────────────────────────────────────

Deno.test("classifyColumns - typical invoice columns are correctly classified", () => {
  const cols = [
    "direction",
    "Nom",
    "Numéro",
    "Date émission",
    "Montant HT",
    "status",
  ];
  const result = classifyColumns(cols);

  assertEquals(result.direction, "direction");
  assertEquals(result.name, "Nom");
  assertEquals(result.id, "Numéro");
  assertEquals(result.dates, ["Date émission"]);
  assertEquals(result.amount, "Montant HT");
  assertEquals(result.status, "status");
});

Deno.test("classifyColumns - columns with no direction field leave direction undefined", () => {
  const cols = ["Nom", "Numéro", "Date émission", "status"];
  const result = classifyColumns(cols);

  assertEquals(result.direction, undefined);
  assertEquals(result.name, "Nom");
  assertEquals(result.id, "Numéro");
});

Deno.test("classifyColumns - multiple date columns all go into dates array", () => {
  const cols = [
    "Date émission",
    "Date d'échéance",
    "Date de réception",
    "Nom",
  ];
  const result = classifyColumns(cols);

  assertEquals(result.dates, [
    "Date émission",
    "Date d'échéance",
    "Date de réception",
  ]);
  assertEquals(result.name, "Nom");
});

Deno.test("classifyColumns - empty columns array produces empty result", () => {
  const result = classifyColumns([]);

  assertEquals(result.direction, undefined);
  assertEquals(result.name, undefined);
  assertEquals(result.id, undefined);
  assertEquals(result.dates, []);
  assertEquals(result.amount, undefined);
  assertEquals(result.status, undefined);
});

Deno.test("classifyColumns - first text column is name, second is id", () => {
  const cols = ["Alpha", "Beta"];
  const result = classifyColumns(cols);

  assertEquals(result.name, "Alpha");
  assertEquals(result.id, "Beta");
});

Deno.test("classifyColumns - single text column sets name, id stays undefined", () => {
  const cols = ["Alpha"];
  const result = classifyColumns(cols);

  assertEquals(result.name, "Alpha");
  assertEquals(result.id, undefined);
});

Deno.test("classifyColumns - amount columns matched on 'montant', 'amount', 'total'", () => {
  assertEquals(classifyColumns(["Montant HT"]).amount, "Montant HT");
  assertEquals(classifyColumns(["total_amount"]).amount, "total_amount");
  assertEquals(classifyColumns(["Net Amount"]).amount, "Net Amount");
  assertEquals(classifyColumns(["Total TTC"]).amount, "Total TTC");
});

// ── isStatusField ─────────────────────────────────────────────────────────────

Deno.test("isStatusField - 'status' is a status field", () => {
  assertEquals(isStatusField("status"), true);
});

Deno.test("isStatusField - 'state' is a status field", () => {
  assertEquals(isStatusField("state"), true);
});

Deno.test("isStatusField - 'Statut' is a status field (case insensitive)", () => {
  assertEquals(isStatusField("Statut"), true);
});

Deno.test("isStatusField - 'lifecycle_status' is a status field", () => {
  assertEquals(isStatusField("lifecycle_status"), true);
});

Deno.test("isStatusField - 'direction' is not a status field", () => {
  assertEquals(isStatusField("direction"), false);
});

Deno.test("isStatusField - 'Nom' is not a status field", () => {
  assertEquals(isStatusField("Nom"), false);
});

// ── isDirectionField ──────────────────────────────────────────────────────────

Deno.test("isDirectionField - 'direction' is a direction field", () => {
  assertEquals(isDirectionField("direction"), true);
});

Deno.test("isDirectionField - 'Direction' is a direction field", () => {
  assertEquals(isDirectionField("Direction"), true);
});

Deno.test("isDirectionField - 'status' is not a direction field", () => {
  assertEquals(isDirectionField("status"), false);
});

Deno.test("isDirectionField - 'DIRECTION' is not a direction field (case-sensitive set)", () => {
  assertEquals(isDirectionField("DIRECTION"), false);
});

// ── colWidth ──────────────────────────────────────────────────────────────────

Deno.test("colWidth - direction column gets fixed width 40", () => {
  assertEquals(colWidth("direction"), { width: 40, minWidth: 40, maxWidth: 40 });
  assertEquals(colWidth("Direction"), { width: 40, minWidth: 40, maxWidth: 40 });
});

Deno.test("colWidth - status column gets fixed width 48", () => {
  assertEquals(colWidth("status"), { width: 48, minWidth: 48, maxWidth: 48 });
  assertEquals(colWidth("Statut"), { width: 48, minWidth: 48, maxWidth: 48 });
});

Deno.test("colWidth - date column gets width 80", () => {
  assertEquals(colWidth("Date émission"), {
    width: 80,
    minWidth: 70,
    maxWidth: 100,
  });
  assertEquals(colWidth("due_date"), { width: 80, minWidth: 70, maxWidth: 100 });
});

Deno.test("colWidth - amount column gets width 120", () => {
  assertEquals(colWidth("Montant HT"), {
    width: 120,
    minWidth: 90,
    maxWidth: 160,
  });
  assertEquals(colWidth("total_amount"), {
    width: 120,
    minWidth: 90,
    maxWidth: 160,
  });
  assertEquals(colWidth("Total TTC"), {
    width: 120,
    minWidth: 90,
    maxWidth: 160,
  });
});

Deno.test("colWidth - unrecognized column returns empty object", () => {
  assertEquals(colWidth("Nom"), {});
  assertEquals(colWidth("Numéro"), {});
  assertEquals(colWidth("Description"), {});
});
