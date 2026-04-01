export type ColumnRole = "direction" | "name" | "id" | "date" | "amount" | "status";

export interface ClassifiedColumns {
  direction?: string;
  name?: string;
  id?: string;
  dates: string[];
  amount?: string;
  status?: string;
}

export const STATUS_FIELDS = new Set([
  "status",
  "state",
  "statut",
  "lifecycle_status",
]);
export const DIRECTION_FIELDS = new Set(["direction", "Direction"]);
export const HIDDEN_FIELDS = new Set([
  "doctype",
  "owner",
  "modified_by",
  "creation",
  "modified",
  "idx",
  "_rowAction",
]);
export const FILTERABLE_COLUMNS = new Set([
  "Direction",
  "Statut",
  "Type",
  "Scope",
  "Pays",
  "status",
  "direction",
  "type",
]);

export function isStatusField(key: string): boolean {
  return STATUS_FIELDS.has(key.toLowerCase());
}

export function isDirectionField(key: string): boolean {
  return DIRECTION_FIELDS.has(key);
}

/** Column width hints — compact columns for icons/badges, stretch for text */
export function colWidth(
  col: string,
): { width?: string | number; minWidth?: number; maxWidth?: number } {
  const lc = col.toLowerCase();
  if (isDirectionField(col)) return { width: 40, minWidth: 40, maxWidth: 40 };
  if (isStatusField(col)) return { width: 48, minWidth: 48, maxWidth: 48 };
  if (lc.includes("date")) return { width: 80, minWidth: 70, maxWidth: 100 };
  if (lc.includes("montant") || lc.includes("amount") || lc.includes("total")) {
    return { width: 120, minWidth: 90, maxWidth: 160 };
  }
  return {};
}

export function classifyColumns(columns: string[]): ClassifiedColumns {
  const result: ClassifiedColumns = { dates: [] };
  const textCols: string[] = [];

  for (const col of columns) {
    const lc = col.toLowerCase();
    if (!result.direction && isDirectionField(col)) {
      result.direction = col;
    } else if (!result.status && isStatusField(col)) {
      result.status = col;
    } else if (
      !result.amount &&
      (lc.includes("montant") || lc.includes("amount") || lc.includes("total"))
    ) {
      result.amount = col;
    } else if (lc.includes("date")) {
      result.dates.push(col);
    } else {
      textCols.push(col);
    }
  }
  // First text column = name, second = id/number
  if (textCols.length > 0) result.name = textCols[0];
  if (textCols.length > 1) result.id = textCols[1];
  return result;
}
