/**
 * InvoiceDetail — Pure invoice rendering component.
 *
 * Extracted from InvoiceViewer. Has zero dependency on App or
 * @modelcontextprotocol/ext-apps — all interactions go through callbacks.
 *
 * Used by:
 * - InvoiceViewer (standalone viewer with full lifecycle)
 * - DoclistViewer (fullscreen detail flow on mobile)
 */

import { useState } from "react";
import { colors, fonts, formatCurrency, styles } from "~/shared/theme";
import { t } from "~/shared/i18n";
import { FeedbackBanner } from "~/shared/Feedback";
import {
  canAcceptReject as canAccept,
  canReceivePayment as canReceivePay,
  canSendPayment as canPay,
} from "~/shared/status";
import { ActionButton } from "~/shared/ActionButton";
import { StatusBadge } from "~/shared/StatusBadge";
import { FullscreenButton } from "~/shared/FullscreenButton";
import { useCompactMode } from "~/shared/useCompactMode";

// ============================================================================
// Constants
// ============================================================================

const LINE_ITEM_COLUMN_WIDTHS = {
  description: { minWidth: 220, maxWidth: 320 },
  quantity: { minWidth: 72 },
  unitPrice: { minWidth: 108 },
  taxRate: { minWidth: 84 },
  amount: { minWidth: 120 },
} as const;

// ============================================================================
// Types
// ============================================================================

interface InvoiceItem {
  description?: string;
  item_name?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  tax_rate?: number;
}

export interface InvoiceDetailProps {
  data: Record<string, unknown>;
  onAction?: (toolName: string, args: Record<string, unknown>) => Promise<string | null>;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isFullscreen?: boolean;
  canFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onDownloadPdf?: () => Promise<void>;
  onDownloadXml?: () => Promise<void>;
  onNavStatusHistory?: () => Promise<void>;
  onNavViewSender?: () => Promise<void>;
  onEmitSuccess?: (emitted: Record<string, unknown>) => void;
}

// ============================================================================
// File-private helpers
// ============================================================================

function FormatBadge({ format }: { format: string }) {
  return (
    <span
      style={{
        ...styles.badge(colors.text.secondary, colors.bg.elevated),
        textTransform: "uppercase" as const,
      }}
    >
      {format}
    </span>
  );
}

function TotalRow(
  { label, value, bold }: { label: string; value: string; bold?: boolean },
) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: bold ? 14 : 13,
      }}
    >
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontWeight: bold ? 700 : 400,
          color: colors.text.primary,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceDetail({
  data,
  onAction,
  onBack,
  onRefresh,
  refreshing,
  isFullscreen,
  canFullscreen,
  onToggleFullscreen,
  onDownloadPdf,
  onDownloadXml,
  onNavStatusHistory,
  onNavViewSender,
  onEmitSuccess,
}: InvoiceDetailProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [emitSuccess, setEmitSuccess] = useState(false);
  const [compact, compactRef] = useCompactMode();

  // Cast for convenience
  const inv = data as {
    id?: string;
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
    items?: InvoiceItem[];
    notes?: string[];
    generated_id?: string;
  };

  const currency = inv.currency ?? "EUR";
  const isReceived = inv.direction === "received";
  const statusStr = inv.status ?? "";
  const statusLower = statusStr.toLowerCase();
  const dir = inv.direction ?? "";
  const isPreview = !emitSuccess &&
    (statusLower === "aperçu" || statusLower === "apercu") &&
    !!inv.generated_id;
  const hasId = !!inv.id && inv.id !== "(aperçu)" && inv.id !== "(apercu)";

  const showAcceptReject = canAccept(statusStr, dir);
  const showSendPayment = canPay(statusStr, dir);
  const showReceivePayment = canReceivePay(statusStr, dir);

  async function runAction(
    actionKey: string,
    toolName: string,
    args: Record<string, unknown>,
    successMsg: string,
  ): Promise<string | null> {
    if (!onAction) return null;
    setActionLoading(actionKey);
    setActionMessage(null);
    const result = await onAction(toolName, args);
    if (result === null) {
      setActionMessage(t("action_failed"));
    } else {
      if (successMsg) setActionMessage(successMsg);
    }
    setActionLoading(null);
    return result;
  }

  return (
    <div ref={compactRef} style={{ padding: 16, fontFamily: fonts.sans }}>
      {/* Title + Status */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                ...styles.button,
                fontSize: 12,
                padding: "4px 10px",
                flexShrink: 0,
              }}
            >
              {t("back")}
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: colors.text.primary,
              }}
            >
              {inv.invoice_number ?? inv.id}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 6,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {inv.status && <StatusBadge code={inv.status} />}
              {inv.format && <FormatBadge format={inv.format} />}
              {inv.network && (
                <span
                  style={{
                    ...styles.badge(colors.text.secondary, colors.bg.elevated),
                    fontSize: 10,
                  }}
                >
                  {inv.network.replace(/_/g, " ")}
                </span>
              )}
              {inv.direction && !isPreview && (
                <span style={{ fontSize: 11, color: colors.text.muted }}>
                  {isReceived ? t("received") : t("sent")}
                </span>
              )}
              {inv.invoice_type && (
                <span style={{ fontSize: 11, color: colors.text.faint }}>
                  — {inv.invoice_type}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={styles.button}
            >
              {refreshing ? "…" : t("refresh")}
            </button>
          )}
          {onToggleFullscreen && (
            <FullscreenButton
              isFullscreen={isFullscreen ?? false}
              canFullscreen={canFullscreen ?? false}
              onToggle={onToggleFullscreen}
              compact={compact}
            />
          )}
        </div>
      </div>

      {/* Action message */}
      {actionMessage && (
        <FeedbackBanner type="success" message={actionMessage} />
      )}

      {/* Parties — two columns (stacks to one on narrow viewports) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
          gap: 16,
          marginBottom: 16,
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}
          >
            {t("sender")}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.primary,
            }}
          >
            {inv.sender_name ?? "—"}
          </div>
          {inv.sender_id && (
            <div style={{ fontSize: 11, color: colors.text.secondary }}>
              SIRET {inv.sender_id}
            </div>
          )}
          {inv.sender_vat && (
            <div style={{ fontSize: 11, color: colors.text.faint }}>
              TVA {inv.sender_vat}
            </div>
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              color: colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}
          >
            {t("recipient")}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.primary,
            }}
          >
            {inv.receiver_name ?? "—"}
          </div>
          {inv.receiver_id && (
            <div style={{ fontSize: 11, color: colors.text.secondary }}>
              SIRET {inv.receiver_id}
            </div>
          )}
          {inv.receiver_vat && (
            <div style={{ fontSize: 11, color: colors.text.faint }}>
              TVA {inv.receiver_vat}
            </div>
          )}
        </div>
      </div>

      {/* Dates */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 24px",
          marginBottom: 16,
          fontSize: 12,
        }}
      >
        {inv.issue_date && (
          <span>
            <span style={{ color: colors.text.muted }}>{t("issue_date")} </span>
            <span style={{ color: colors.text.primary, fontWeight: 500 }}>
              {inv.issue_date}
            </span>
          </span>
        )}
        {inv.due_date && (
          <span>
            <span style={{ color: colors.text.muted }}>{t("due_date")} </span>
            <span style={{ color: colors.text.primary, fontWeight: 500 }}>
              {inv.due_date}
            </span>
          </span>
        )}
        {inv.receipt_date && (
          <span>
            <span style={{ color: colors.text.muted }}>{t("receipt_date")} </span>
            <span style={{ color: colors.text.primary, fontWeight: 500 }}>
              {inv.receipt_date.split("T")[0]}
            </span>
          </span>
        )}
      </div>

      {/* Line Items */}
      {inv.items && inv.items.length > 0 && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div style={styles.tableScrollViewport}>
            <table
              style={{
                width: "max-content",
                minWidth: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      ...styles.tableHeader,
                      ...LINE_ITEM_COLUMN_WIDTHS.description,
                      background: colors.bg.surface,
                    }}
                  >
                    {t("description")}
                  </th>
                  <th
                    style={{
                      ...styles.tableHeader,
                      ...LINE_ITEM_COLUMN_WIDTHS.quantity,
                      background: colors.bg.surface,
                      textAlign: "right",
                    }}
                  >
                    {t("qty")}
                  </th>
                  {!compact && (
                    <th
                      style={{
                        ...styles.tableHeader,
                        ...LINE_ITEM_COLUMN_WIDTHS.unitPrice,
                        background: colors.bg.surface,
                        textAlign: "right",
                      }}
                    >
                      {t("unit_price")}
                    </th>
                  )}
                  {!compact && (
                    <th
                      style={{
                        ...styles.tableHeader,
                        ...LINE_ITEM_COLUMN_WIDTHS.taxRate,
                        background: colors.bg.surface,
                        textAlign: "right",
                      }}
                    >
                      {t("vat_pct")}
                    </th>
                  )}
                  <th
                    style={{
                      ...styles.tableHeader,
                      ...LINE_ITEM_COLUMN_WIDTHS.amount,
                      background: colors.bg.surface,
                      textAlign: "right",
                    }}
                  >
                    {t("amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((item, i) => (
                  <tr
                    key={i}
                    style={{ transition: "background 0.1s" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        colors.bg.hover;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                    }}
                  >
                    <td
                      style={{
                        ...styles.tableCell,
                        ...LINE_ITEM_COLUMN_WIDTHS.description,
                        verticalAlign: "top",
                      }}
                    >
                      {item.description ?? item.item_name ?? "—"}
                    </td>
                    <td
                      style={{
                        ...styles.tableCell,
                        ...LINE_ITEM_COLUMN_WIDTHS.quantity,
                        textAlign: "right",
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.quantity ?? "—"}
                    </td>
                    {!compact && (
                      <td
                        style={{
                          ...styles.tableCell,
                          ...LINE_ITEM_COLUMN_WIDTHS.unitPrice,
                          textAlign: "right",
                          fontFamily: fonts.mono,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.unit_price != null
                          ? formatCurrency(item.unit_price, currency)
                          : "—"}
                      </td>
                    )}
                    {!compact && (
                      <td
                        style={{
                          ...styles.tableCell,
                          ...LINE_ITEM_COLUMN_WIDTHS.taxRate,
                          textAlign: "right",
                          fontFamily: fonts.mono,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.tax_rate != null ? `${item.tax_rate}%` : "—"}
                      </td>
                    )}
                    <td
                      style={{
                        ...styles.tableCell,
                        ...LINE_ITEM_COLUMN_WIDTHS.amount,
                        textAlign: "right",
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.amount != null
                        ? formatCurrency(item.amount, currency)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            minWidth: 220,
            borderTop: `1px solid ${colors.border}`,
            paddingTop: 8,
          }}
        >
          {inv.total_ht != null && (
            <TotalRow
              label={t("total_ht")}
              value={formatCurrency(inv.total_ht, currency)}
            />
          )}
          {inv.total_tax != null && (
            <TotalRow
              label={t("total_tax")}
              value={formatCurrency(inv.total_tax, currency)}
            />
          )}
          {inv.total_ttc != null && (
            <TotalRow
              label={t("total_ttc")}
              value={formatCurrency(inv.total_ttc, currency)}
              bold
            />
          )}
        </div>
      </div>

      {/* Notes */}
      {inv.notes && inv.notes.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            borderTop: `1px solid ${colors.border}`,
            paddingTop: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 6,
            }}
          >
            {t("notes")}
          </div>
          {inv.notes.map((note, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: colors.text.secondary,
                marginBottom: 4,
                whiteSpace: "pre-wrap",
              }}
            >
              {note}
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: "12px 0",
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        {/* Preview: emit */}
        {isPreview && onAction && (
          <ActionButton
            label={t("submit_invoice")}
            variant="success"
            confirm
            loading={actionLoading === "emit"}
            onClick={async () => {
              const resultText = await runAction(
                "emit",
                "einvoice_invoice_submit",
                { generated_id: inv.generated_id },
                "",
              );
              if (resultText) {
                try {
                  const emitResponse = JSON.parse(resultText);
                  setEmitSuccess(true);
                  setActionMessage(t("invoice_submitted"));
                  if (onEmitSuccess) {
                    onEmitSuccess({
                      ...data,
                      id: emitResponse.id ?? inv.id,
                      status: "submitted",
                      generated_id: undefined,
                    });
                  }
                } catch {
                  setEmitSuccess(true);
                  if (onEmitSuccess) {
                    onEmitSuccess({
                      ...data,
                      status: "submitted",
                      generated_id: undefined,
                    });
                  }
                }
              }
            }}
          />
        )}

        {/* Accept / Reject / Dispute */}
        {showAcceptReject && onAction && (
          <>
            <ActionButton
              label={t("accept")}
              variant="success"
              confirm
              loading={actionLoading === "status_accept"}
              onClick={() =>
                runAction("status_accept", "einvoice_status_send", {
                  invoice_id: inv.id,
                  code: "APPROVED",
                }, t("invoice_accepted"))}
            />
            <ActionButton
              label={t("reject")}
              variant="error"
              confirm
              loading={actionLoading === "status_reject"}
              onClick={() =>
                runAction("status_reject", "einvoice_status_send", {
                  invoice_id: inv.id,
                  code: "REFUSED",
                }, t("invoice_refused"))}
            />
            <ActionButton
              label={t("dispute")}
              variant="info"
              confirm
              loading={actionLoading === "status_dispute"}
              onClick={() =>
                runAction("status_dispute", "einvoice_status_send", {
                  invoice_id: inv.id,
                  code: "DISPUTED",
                }, t("dispute_filed"))}
            />
          </>
        )}

        {/* Payment sent */}
        {showSendPayment && onAction && (
          <ActionButton
            label={t("payment_sent")}
            variant="success"
            confirm
            loading={actionLoading === "status_payment_sent"}
            onClick={() =>
              runAction("status_payment_sent", "einvoice_status_send", {
                invoice_id: inv.id,
                code: "PAYMENT_SENT",
              }, t("payment_sent"))}
          />
        )}

        {/* Payment received */}
        {showReceivePayment && onAction && (
          <ActionButton
            label={t("payment_received")}
            variant="success"
            confirm
            loading={actionLoading === "status_payment_received"}
            onClick={() =>
              runAction("status_payment_received", "einvoice_status_send", {
                invoice_id: inv.id,
                code: "PAYMENT_RECEIVED",
              }, t("payment_received"))}
          />
        )}

        {/* Download buttons — only when handlers provided */}
        {hasId && onDownloadPdf && (
          <ActionButton
            label={t("download_pdf")}
            variant="default"
            loading={actionLoading === "download_pdf"}
            onClick={async () => {
              setActionLoading("download_pdf");
              try {
                await onDownloadPdf();
              } finally {
                setActionLoading(null);
              }
            }}
          />
        )}
        {hasId && onDownloadXml && (
          <ActionButton
            label={t("download_xml")}
            variant="default"
            loading={actionLoading === "download_xml"}
            onClick={async () => {
              setActionLoading("download_xml");
              try {
                await onDownloadXml();
              } finally {
                setActionLoading(null);
              }
            }}
          />
        )}
      </div>

      {/* Navigation buttons — only when handlers provided */}
      {hasId && (onNavStatusHistory || (onNavViewSender && inv.sender_id)) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            paddingBottom: 12,
          }}
        >
          {onNavStatusHistory && (
            <ActionButton
              label={t("status_history")}
              variant="default"
              loading={actionLoading === "nav_history"}
              onClick={async () => {
                setActionLoading("nav_history");
                try {
                  await onNavStatusHistory();
                } finally {
                  setActionLoading(null);
                }
              }}
            />
          )}
          {onNavViewSender && inv.sender_id && (
            <ActionButton
              label={t("view_sender")}
              variant="default"
              loading={actionLoading === "nav_dir_sender"}
              onClick={async () => {
                setActionLoading("nav_dir_sender");
                try {
                  await onNavViewSender();
                } finally {
                  setActionLoading(null);
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
