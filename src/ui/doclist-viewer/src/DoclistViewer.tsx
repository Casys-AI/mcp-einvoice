/**
 * Doclist Viewer — Generic table for E-Invoice data
 *
 * Auto-detects columns, sorting, filtering, pagination, CSV export.
 * French e-invoicing statuses (PPF lifecycle).
 */

import { useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { BrandFooter, BrandHeader } from "~/shared/Brand";
import { t } from "~/shared/i18n";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import type { DoclistData } from "./types";
import { formatCell } from "./formatCell";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { DoclistEmptyState } from "./DoclistEmptyState";
import { DoclistContent } from "./DoclistContent";

const app = new App({ name: "Doclist Viewer", version: "1.0.0" });
const TOOL_CALL_TIMEOUT_MS = 10_000;
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

export function DoclistViewer() {
  const [data, setData] = useState<DoclistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<DoclistData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: DoclistData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(
      nextData,
      refreshRequestRef.current,
    );
    setData(nextData);
    // Note: statusOverrides are cleared in DoclistContent via data dependency
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      if (!parsed) return false;
      // Detect doclist-shaped results vs drill-down results (invoice, entity).
      // Doclist results have data[], or doclist markers (_title, _rowAction, count).
      if (!Array.isArray(parsed.data)) {
        if (parsed._title || parsed._rowAction) {
          // Empty doclist (e.g. no unseen invoices) — ensure data is an array
          parsed.data = [];
        } else {
          return false; // Not a doclist — drill-down result handled by InlineDetailPanel
        }
      }
      hydrateData(parsed as DoclistData);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError(t("error_parsing"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(
    options: { ignoreInterval?: boolean } = {},
  ): Promise<void> {
    const request = resolveUiRefreshRequest(
      dataRef.current,
      refreshRequestRef.current,
    );
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: refreshInFlightRef.current,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: REFRESH_THROTTLE_MS,
      }, options)
    ) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) setError(t("error_refresh"));
      else if (!consumeToolResult(result)) setError(t("no_data"));
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    app.connect().catch(() => {});
    app.ontoolresult = (result: ToolResultPayload) => {
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!dataRef.current) setLoading(true);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => void requestRefresh({ ignoreInterval: true });
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    };
    globalThis.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      globalThis.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      aria-busy={refreshing}
    >
      <BrandHeader />
      <div style={{ flex: 1 }}>
        {loading && <LoadingSkeleton />}
        {!loading && !data && <DoclistEmptyState />}
        {!loading && data && (
          <DoclistContent
            data={data}
            error={error}
            refreshing={refreshing}
            onRefresh={() => void requestRefresh({ ignoreInterval: true })}
            onError={setError}
            onExport={(columns, rows) =>
              void exportCsv(columns, rows, data.doctype)}
            app={app}
          />
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
