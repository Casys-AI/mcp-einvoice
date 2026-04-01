/**
 * Invoice Viewer — E-Invoice
 *
 * Shell component: lifecycle, display mode, download wrappers.
 * All invoice rendering is delegated to InvoiceDetail (shared).
 */

import { useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { t } from "~/shared/i18n";
import { EmptyInvoiceIcon } from "~/shared/Feedback";
import { PageShell } from "~/shared/PageShell";
import { useViewerLifecycle } from "~/shared/useViewerLifecycle";
import {
  extractToolResultText,
  type ToolResultPayload,
} from "~/shared/refresh";
import { useDisplayMode } from "~/shared/useDisplayMode";
import { InvoiceDetail } from "~/shared/InvoiceDetail";

const app = new App(
  { name: "Invoice Viewer", version: "1.0.0" },
  { availableDisplayModes: ["inline", "fullscreen"] },
);

const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 30_000;

interface InvoiceData {
  id: string;
  invoice_number?: string;
  status?: string;
  direction?: string;
  format?: string;
  network?: string;
  invoice_type?: string;
  sender_name?: string;
  sender_id?: string;
  sender_vat?: string;
  receiver_name?: string;
  receiver_id?: string;
  receiver_vat?: string;
  issue_date?: string;
  due_date?: string;
  receipt_date?: string;
  currency?: string;
  total_ht?: number;
  total_tax?: number;
  total_ttc?: number;
  items?: unknown[];
  notes?: string[];
  generated_id?: string;
  refreshRequest?: import("~/shared/refresh").UiRefreshRequestData;
}

function parseInvoicePayload(
  result: ToolResultPayload,
): import("~/shared/useViewerLifecycle").ParsePayloadResult<InvoiceData> {
  const text = extractToolResultText(result);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const invoiceData = parsed.preview ?? parsed;
    if (parsed.generated_id && !invoiceData.generated_id) {
      invoiceData.generated_id = parsed.generated_id;
    }
    return { data: invoiceData as InvoiceData };
  } catch {
    return { error: t("error_parsing") };
  }
}

export function InvoiceViewer() {
  const { isFullscreen, canFullscreen, toggleFullscreen } = useDisplayMode(app);

  // Auto-request fullscreen when the host supports it — invoice detail deserves full screen
  useEffect(() => {
    if (canFullscreen && !isFullscreen) toggleFullscreen();
  }, [canFullscreen]);

  const {
    data,
    loading,
    refreshing,
    onRefresh,
    onRefreshWithDelay,
    hydrateData,
  } = useViewerLifecycle<InvoiceData>({
    app,
    minIntervalMs: REFRESH_INTERVAL_MS,
    parsePayload: parseInvoicePayload,
    enableAutoRefresh: true,
  });

  /** Calls a server tool and returns result text, or null on error. */
  async function callAction(
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
      onRefreshWithDelay(2000);
      return extractToolResultText(result) ?? "";
    } catch {
      return null;
    }
  }

  /** Downloads a file by calling a tool and delegating to app.downloadFile. */
  async function downloadFile(
    toolName: string,
    filename: string,
  ): Promise<void> {
    if (!data) return;
    const resultText = await callAction(toolName, { id: data.id });
    if (!resultText) return;
    try {
      const file = JSON.parse(resultText);
      if (!file.data_base64) return;
      const mimeType = file.content_type ?? "application/octet-stream";
      await app.downloadFile({
        contents: [{
          type: "resource",
          resource: {
            uri: `file:///${filename}`,
            mimeType,
            blob: file.data_base64,
          },
        }],
      });
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                height: i === 1 ? 32 : 20,
                width: `${40 + i * 10}%`,
                marginBottom: 8,
              }}
            />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            gap: 12,
            height: "100%",
          }}
        >
          <EmptyInvoiceIcon />
          <div style={{ fontSize: 13 }}>{t("no_invoice")}</div>
        </div>
      </PageShell>
    );
  }

  const invNum = data.invoice_number ?? data.id ?? "facture";

  return (
    <PageShell refreshing={refreshing}>
      <InvoiceDetail
        data={data as Record<string, unknown>}
        onAction={callAction}
        onRefresh={onRefresh}
        refreshing={refreshing}
        isFullscreen={isFullscreen}
        canFullscreen={canFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onDownloadPdf={async () => {
          // Try readable PDF first, fallback to source XML
          const pdfName = `${invNum}.pdf`;
          const xmlName = `${invNum}.xml`;
          await downloadFile("einvoice_invoice_download_readable", pdfName)
            .catch(() => downloadFile("einvoice_invoice_download", xmlName));
        }}
        onDownloadXml={() =>
          downloadFile(
            "einvoice_invoice_download",
            `${invNum}.xml`,
          )}
        onNavStatusHistory={async () => {
          try {
            await app.sendMessage({
              role: "user",
              content: [{
                type: "text",
                text: `${t("nav_status_history")} ${data.id}`,
              }],
            });
          } catch { /* host may not support sendMessage */ }
        }}
        onNavViewSender={data.sender_id
          ? async () => {
            try {
              await app.sendMessage({
                role: "user",
                content: [{
                  type: "text",
                  text: t("nav_directory_sender").replace(
                    "{siret}",
                    data.sender_id!,
                  ),
                }],
              });
            } catch { /* host may not support sendMessage */ }
          }
          : undefined}
        onEmitSuccess={(emitted) => {
          hydrateData(emitted as InvoiceData);
        }}
      />
    </PageShell>
  );
}
