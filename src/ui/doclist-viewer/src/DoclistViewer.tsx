/**
 * Doclist Viewer — Generic table for E-Invoice data
 *
 * Auto-detects columns, sorting, filtering, pagination, CSV export.
 * French e-invoicing statuses (PPF lifecycle).
 *
 * On mobile (compact): "Détails complets" opens a fullscreen InvoiceDetail
 * directly — no round-trip through Claude. On desktop, it still sends a
 * message to open the InvoiceViewer as before.
 */

import { useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { t } from "~/shared/i18n";
import { PageShell } from "~/shared/PageShell";
import {
  extractToolResultText,
  type ToolResultPayload,
} from "~/shared/refresh";
import { useViewerLifecycle } from "~/shared/useViewerLifecycle";
import { useDisplayMode } from "~/shared/useDisplayMode";
import { InvoiceDetail } from "~/shared/InvoiceDetail";
import type { DoclistData } from "./types";
import { formatCell } from "./formatCell";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { DoclistEmptyState } from "./DoclistEmptyState";
import { DoclistContent } from "./DoclistContent";

const app = new App(
  { name: "Doclist Viewer", version: "1.0.0" },
  { availableDisplayModes: ["inline", "fullscreen"] },
);
const REFRESH_THROTTLE_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

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
    if (!Array.isArray(parsed.data)) {
      if (parsed._title || parsed._rowAction) {
        parsed.data = [];
      } else {
        return null;
      }
    }
    return { data: parsed as DoclistData };
  } catch {
    return { error: t("error_parsing") };
  }
}

export function DoclistViewer() {
  const { isFullscreen, requestFullscreen } = useDisplayMode(app);
  const [fullscreenDetailData, setFullscreenDetailData] = useState<
    Record<string, unknown> | null
  >(null);

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

  function onOpenFullscreenDetail(detailData: Record<string, unknown>) {
    setFullscreenDetailData(detailData);
    requestFullscreen();
  }

  function onBack() {
    setFullscreenDetailData(null);
    // Exit fullscreen — requestDisplayMode back to inline
    void app.requestDisplayMode({ mode: "inline" });
  }

  async function callDetailAction(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string | null> {
    if (!app.getHostCapabilities()?.serverTools) return null;
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) return null;
      return extractToolResultText(result) ?? "";
    } catch {
      return null;
    }
  }

  // Fullscreen detail view — shown when user tapped "Détails complets" on mobile
  if (isFullscreen && fullscreenDetailData) {
    return (
      <PageShell>
        <InvoiceDetail
          data={fullscreenDetailData}
          onBack={onBack}
          onAction={callDetailAction}
        />
      </PageShell>
    );
  }

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
          onOpenDetail={onOpenFullscreenDetail}
        />
      )}
    </PageShell>
  );
}
