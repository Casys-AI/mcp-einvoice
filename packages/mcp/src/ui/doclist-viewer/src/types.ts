import type { UiRefreshRequestData } from "~/shared/refresh";

export interface RowAction {
  toolName: string;
  /** Dot-path to the ID field in each row (e.g. "metadata.invoiceId") */
  idField: string;
  /** Argument name to pass to the tool (e.g. "id") */
  argName: string;
}

export interface DoclistData {
  count: number;
  doctype?: string;
  _title?: string;
  data: Record<string, unknown>[];
  refreshRequest?: UiRefreshRequestData;
  _rowAction?: RowAction;
}

export type SortDir = "asc" | "desc";
