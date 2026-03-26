/**
 * Doclist Viewer — Generic table for E-Invoice data
 *
 * Auto-detects columns, sorting, filtering, pagination, CSV export.
 * French e-invoicing statuses (PPF lifecycle).
 */

import { App } from "@modelcontextprotocol/ext-apps";
import { t } from "~/shared/i18n";
import { PageShell } from "~/shared/PageShell";
import {
  extractToolResultText,
  type ToolResultPayload,
} from "~/shared/refresh";
import { useViewerLifecycle } from "~/shared/useViewerLifecycle";
import type { DoclistData } from "./types";
import { formatCell } from "./formatCell";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { DoclistEmptyState } from "./DoclistEmptyState";
import { DoclistContent } from "./DoclistContent";

const app = new App({ name: "Doclist Viewer", version: "1.0.0" });
const REFRESH_THROTTLE_MS = 15_000;

async function exportCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  doctype?: string,
) {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((col) => {
      const v = formatCell(row[col]);
      return v.includes(",") || v.includes('"')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(",")
  ).join("\n");

  const csv = `${header}\n${body}`;
  const filename = `${doctype ?? "export"}.csv`;
  // Use MCP Apps SDK downloadFile — works in sandboxed iframes
  try {
    await app.downloadFile({
      contents: [{
        type: "resource",
        resource: {
          uri: `file:///${filename}`,
          mimeType: "text/csv",
          text: csv,
        },
      }],
    });
  } catch {
    // Fallback to blob URL for non-MCP hosts (inspector, test harness)
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function parseDoclistPayload(
  result: ToolResultPayload,
): import("~/shared/useViewerLifecycle").ParsePayloadResult<DoclistData> {
  const text = extractToolResultText(result);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed) return null;
    // Detect doclist-shaped results vs drill-down results (invoice, entity).
    // Doclist results have data[], or doclist markers (_title, _rowAction, count).
    if (!Array.isArray(parsed.data)) {
      if (parsed._title || parsed._rowAction) {
        // Empty doclist (e.g. no unseen invoices) — ensure data is an array
        parsed.data = [];
      } else {
        return null; // Not a doclist — drill-down result handled by InlineDetailPanel
      }
    }
    return { data: parsed as DoclistData };
  } catch {
    return { error: t("error_parsing") };
  }
}

export function DoclistViewer() {
  const {
    data,
    loading,
    refreshing,
    error,
    onRefresh,
    onError,
  } = useViewerLifecycle<DoclistData>({
    app,
    minIntervalMs: REFRESH_THROTTLE_MS,
    parsePayload: parseDoclistPayload,
  });
  return (
    <PageShell refreshing={refreshing}>
      {loading && <LoadingSkeleton />}
      {!loading && !data && <DoclistEmptyState />}
      {!loading && data && (
        <DoclistContent
          data={data}
          error={error}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onError={onError}
          onExport={(columns, rows) =>
            void exportCsv(columns, rows, data.doctype)}
          app={app}
        />
      )}
    </PageShell>
  );
}
