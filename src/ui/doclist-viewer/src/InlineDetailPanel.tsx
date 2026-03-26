import { useState } from "react";
import { colors, formatCurrency, styles } from "~/shared/theme";
import { t } from "~/shared/i18n";
import {
  canAcceptReject,
  canReceivePayment,
  canSendPayment,
  getStatus,
} from "~/shared/status";
import { ActionButton } from "~/shared/ActionButton";
import { InfoCard } from "~/shared/InfoCard";
import { formatCell } from "./formatCell";

export function InlineDetailPanel(
  { data, loading, onClose, onAction, onNavigate }: {
    data: Record<string, unknown> | null;
    loading: boolean;
    onClose: () => void;
    onAction: (
      toolName: string,
      args: Record<string, unknown>,
    ) => Promise<boolean>;
    onNavigate?: (invoiceId: string) => void;
  },
) {
  const [actLoading, setActLoading] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actOk, setActOk] = useState(true);

  if (loading) {
    return (
      <div style={{ padding: 16, background: colors.bg.surface }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 14, width: `${30 + i * 15}%`, marginBottom: 8 }}
          />
        ))}
      </div>
    );
  }
  if (!data) return null;

  async function act(
    key: string,
    tool: string,
    args: Record<string, unknown>,
    msg: string,
  ) {
    setActLoading(key);
    setActMsg(null);
    const ok = await onAction(tool, args);
    setActOk(ok);
    setActMsg(ok ? msg : t("action_failed"));
    setActLoading(null);
  }

  // Detect invoice data vs generic
  const inv = data as Record<string, unknown>;
  const isInvoice = "sender_name" in inv || "invoice_number" in inv ||
    ("id" in inv && "status" in inv && "direction" in inv);

  if (!isInvoice) {
    // Flatten nested objects for display — show primitives as cards, expand objects one level
    const flatEntries: [string, string][] = [];
    for (const [k, v] of Object.entries(inv)) {
      if (k.startsWith("_") || k === "refreshRequest") continue;
      if (v == null) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        // Expand one level: postalAddress.city → "city"
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          if (sv != null && typeof sv !== "object") {
            flatEntries.push([`${k}.${sk}`, String(sv)]);
          }
        }
      } else if (Array.isArray(v)) {
        flatEntries.push([
          k,
          `${v.length} ${v.length > 1 ? t("items") : t("item")}`,
        ]);
      } else {
        flatEntries.push([k, formatCell(v)]);
      }
    }
    // Extract a title from common name fields
    const title = String(
      inv.name ?? inv.corporateName ?? inv.label ?? t("details"),
    );
    return (
      <div
        style={{
          padding: 16,
          background: colors.bg.surface,
          borderTop: `2px solid ${colors.accent}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: colors.text.primary,
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}
          >
            ✕
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 6,
          }}
        >
          {flatEntries.map(([k, v]) => (
            <InfoCard
              key={k}
              label={k.replace(/_/g, " ").replace(/\./g, " › ")}
              value={v}
            />
          ))}
        </div>
      </div>
    );
  }

  // Invoice detail
  const statusStr = String(inv.status ?? "");
  const statusScheme = getStatus(statusStr);
  const isReceived = inv.direction === "received";
  const currency = String(inv.currency ?? "EUR");
  const hasId = !!inv.id && inv.id !== "(aperçu)";
  const dir = String(inv.direction ?? "");

  const showAcceptReject = canAcceptReject(statusStr, dir);
  const showSendPayment = canSendPayment(statusStr, dir);
  const showReceivePayment = canReceivePayment(statusStr, dir);

  return (
    <div
      style={{
        padding: 16,
        background: colors.bg.surface,
        borderTop: `2px solid ${colors.accent}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.primary,
            }}
          >
            {String(inv.invoice_number ?? inv.id)}
          </span>
          <span style={styles.badge(statusScheme.color, statusScheme.bg)}>
            {statusScheme.label}
          </span>
          {inv.direction && (
            <span style={{ fontSize: 11, color: colors.text.muted }}>
              {isReceived ? t("received") : t("sent")}
            </span>
          )}
          {inv.format && (
            <span
              style={{
                ...styles.badge(colors.text.secondary, colors.bg.elevated),
                fontSize: 10,
              }}
            >
              {String(inv.format).toUpperCase()}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}
        >
          ✕
        </button>
      </div>

      {/* Info grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {inv.sender_name && (
          <InfoCard
            label={t("sender")}
            value={String(inv.sender_name)}
            sub={inv.sender_id ? `SIRET ${inv.sender_id}` : undefined}
          />
        )}
        {inv.receiver_name && (
          <InfoCard
            label={t("recipient")}
            value={String(inv.receiver_name)}
            sub={inv.receiver_id ? `SIRET ${inv.receiver_id}` : undefined}
          />
        )}
        {inv.issue_date && (
          <InfoCard
            label={t("issue_date_long")}
            value={String(inv.issue_date)}
          />
        )}
        {inv.due_date && (
          <InfoCard label={t("due_date")} value={String(inv.due_date)} />
        )}
        {inv.total_ttc != null && (
          <InfoCard
            label={t("total_ttc")}
            value={formatCurrency(Number(inv.total_ttc), currency)}
            bold
          />
        )}
        {inv.total_ht != null && (
          <InfoCard
            label={t("total_ht")}
            value={formatCurrency(Number(inv.total_ht), currency)}
          />
        )}
      </div>

      {/* Action feedback */}
      {actMsg && (
        <div
          style={{
            fontSize: 11,
            color: actOk ? colors.success : colors.error,
            marginBottom: 8,
          }}
        >
          {actMsg}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        {showAcceptReject && (
          <>
            <ActionButton
              size="sm"
              label={t("accept")}
              variant="success"
              loading={actLoading === "accept"}
              onClick={() =>
                act("accept", "einvoice_status_send", {
                  invoice_id: inv.id,
                  code: "APPROVED",
                }, t("invoice_accepted"))}
            />
            <ActionButton
              size="sm"
              label={t("reject")}
              variant="error"
              confirm
              loading={actLoading === "reject"}
              onClick={() =>
                act("reject", "einvoice_status_send", {
                  invoice_id: inv.id,
                  code: "REFUSED",
                }, t("invoice_refused"))}
            />
            <ActionButton
              size="sm"
              label={t("dispute")}
              variant="default"
              confirm
              loading={actLoading === "dispute"}
              onClick={() =>
                act("dispute", "einvoice_status_send", {
                  invoice_id: inv.id,
                  code: "DISPUTED",
                }, t("dispute_filed"))}
            />
          </>
        )}
        {showSendPayment && (
          <ActionButton
            size="sm"
            label={t("payment_sent")}
            variant="success"
            loading={actLoading === "pay"}
            onClick={() =>
              act("pay", "einvoice_status_send", {
                invoice_id: inv.id,
                code: "PAYMENT_SENT",
              }, t("payment_sent"))}
          />
        )}
        {showReceivePayment && (
          <ActionButton
            size="sm"
            label={t("payment_received")}
            variant="success"
            loading={actLoading === "payrcv"}
            onClick={() =>
              act("payrcv", "einvoice_status_send", {
                invoice_id: inv.id,
                code: "PAYMENT_RECEIVED",
              }, t("payment_received"))}
          />
        )}
        {hasId && (
          <ActionButton
            size="sm"
            label={t("full_details")}
            onClick={() => {
              if (onNavigate) onNavigate(String(inv.id));
            }}
          />
        )}
      </div>
    </div>
  );
}
