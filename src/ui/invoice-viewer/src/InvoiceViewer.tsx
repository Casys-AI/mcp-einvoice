/**
 * Invoice Viewer — E-Invoice
 *
 * Displays a single invoice with:
 * - Header: invoice number, status badge, direction (sent/received)
 * - Info grid: sender, receiver, dates, amounts
 * - Line items table
 * - Totals (HT, TVA, TTC)
 * - Interactive action buttons (accept, reject, mark seen, download PDF)
 *
 * Statuses follow the French e-invoicing lifecycle (PPF/PA):
 * deposited → received → accepted/rejected/disputed → paid
 */

import { useState, useEffect, useRef, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatCurrency } from "~/shared/theme";
import { IopoleBrandHeader, IopoleBrandFooter } from "~/shared/IopoleBrand";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";

const app = new App({ name: "Invoice Viewer", version: "1.0.0" });
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

// ============================================================================
// Types — Iopole invoice data shape
// ============================================================================

interface InvoiceItem {
  description?: string;
  item_name?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  tax_rate?: number;
}

interface InvoiceData {
  id: string;
  invoice_number?: string;
  status?: string;
  direction?: string; // "sent" | "received"
  format?: string;       // FacturX, CII, UBL
  network?: string;      // DOMESTIC_FR, PEPPOL, etc.
  invoice_type?: string; // "Commercial invoice", etc.
  sender_name?: string;
  sender_id?: string;    // SIRET
  sender_vat?: string;   // TVA intracommunautaire
  receiver_name?: string;
  receiver_id?: string;
  receiver_vat?: string;
  issue_date?: string;
  due_date?: string;
  receipt_date?: string;
  currency?: string;
  total_ht?: number;     // Total hors taxes
  total_tax?: number;    // TVA
  total_ttc?: number;    // Total TTC
  items?: InvoiceItem[];
  notes?: string[];      // Payment notes, conditions
  generated_id?: string; // From generate preview — used to emit via einvoice_invoice_emit
  refreshRequest?: UiRefreshRequestData;
}

// ============================================================================
// Status colors — French e-invoicing lifecycle
// ============================================================================

const INVOICE_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  // Aperçu (generate preview)
  "aperçu":          { color: colors.warning,   bg: colors.warningDim, label: "Aperçu — non envoyée" },
  "apercu":          { color: colors.warning,   bg: colors.warningDim, label: "Aperçu — non envoyée" },
  // Iopole API statuses (uppercase)
  delivered:         { color: colors.info,      bg: colors.infoDim,    label: "Livrée" },
  in_hand:           { color: colors.info,      bg: colors.infoDim,    label: "Prise en charge" },
  approved:          { color: colors.success,   bg: colors.successDim, label: "Acceptée" },
  partially_approved: { color: colors.warning,  bg: colors.warningDim, label: "Partiellement acceptée" },
  completed:         { color: colors.success,   bg: colors.successDim, label: "Complétée" },
  payment_sent:      { color: colors.success,   bg: colors.successDim, label: "Paiement envoyé" },
  payment_received:  { color: colors.success,   bg: colors.successDim, label: "Paiement reçu" },
  suspended:         { color: colors.warning,   bg: colors.warningDim, label: "Suspendue" },
  disputed:          { color: colors.warning,   bg: colors.warningDim, label: "Litigieuse" },
  refused:           { color: colors.error,     bg: colors.errorDim,   label: "Refusée" },
  cancelled:         { color: colors.text.faint, bg: colors.bg.elevated, label: "Annulée" },
  // Legacy / French lifecycle aliases
  deposited:         { color: colors.info,      bg: colors.infoDim,    label: "Déposée" },
  received:          { color: colors.info,      bg: colors.infoDim,    label: "Reçue" },
  accepted:          { color: colors.success,   bg: colors.successDim, label: "Acceptée" },
  paid:              { color: colors.success,   bg: colors.successDim, label: "Payée" },
  rejected:          { color: colors.error,     bg: colors.errorDim,   label: "Rejetée" },
  pending:           { color: colors.warning,   bg: colors.warningDim, label: "En attente" },
};

function StatusBadge({ status }: { status: string }) {
  const scheme = INVOICE_STATUS[status.toLowerCase()];
  if (!scheme) return <span style={styles.badge(colors.text.muted, colors.bg.elevated)}>{status}</span>;
  return <span style={styles.badge(scheme.color, scheme.bg)}>{scheme.label}</span>;
}

function FormatBadge({ format }: { format: string }) {
  return <span style={{ ...styles.badge(colors.text.secondary, colors.bg.elevated), textTransform: "uppercase" as const }}>{format}</span>;
}

// ============================================================================
// Action Buttons — interactive tool calls
// ============================================================================

function ActionButton({ label, icon, variant, disabled, loading, onClick }: {
  label: string;
  icon?: string;
  variant?: "success" | "error" | "info" | "default";
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const variantColors = {
    success: { color: colors.success, bg: colors.successDim },
    error: { color: colors.error, bg: colors.errorDim },
    info: { color: colors.info, bg: colors.infoDim },
    default: { color: colors.text.secondary, bg: colors.bg.elevated },
  };
  const vc = variantColors[variant ?? "default"];

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        ...styles.button,
        background: vc.bg,
        color: vc.color,
        borderColor: vc.color,
        opacity: disabled || loading ? 0.5 : 1,
        cursor: disabled || loading ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceViewer() {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [emitSuccess, setEmitSuccess] = useState(false);
  const dataRef = useRef<InvoiceData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: InvoiceData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(nextData, refreshRequestRef.current);
    setData(nextData);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      // If the result has a `preview` field (from generate tools), use that for display
      const invoiceData = parsed.preview ?? parsed;
      // Propagate generated_id from the outer payload into the invoice data
      if (parsed.generated_id && !invoiceData.generated_id) {
        invoiceData.generated_id = parsed.generated_id;
      }
      hydrateData(invoiceData as InvoiceData);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError("Erreur de parsing");
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    const request = resolveUiRefreshRequest(dataRef.current, refreshRequestRef.current);
    if (!canRequestUiRefresh({
      request,
      visibilityState: typeof document === "undefined" ? "visible" : document.visibilityState,
      refreshInFlight: refreshInFlightRef.current,
      now: Date.now(),
      lastRefreshStartedAt: lastRefreshStartedAtRef.current,
      minIntervalMs: REFRESH_INTERVAL_MS,
    }, options)) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({ name: request.toolName, arguments: request.arguments }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (!result.isError) consumeToolResult(result);
      else setError("Échec du rafraîchissement");
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  async function callAction(actionKey: string, toolName: string, args: Record<string, unknown>, successMsg: string): Promise<string | null> {
    if (!app.getHostCapabilities()?.serverTools) return null;
    setActionLoading(actionKey);
    setActionMessage(null);

    try {
      const result = await app.callServerTool({ name: toolName, arguments: args }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) {
        setActionMessage("Action échouée");
        return null;
      } else {
        if (successMsg) setActionMessage(successMsg);
        // Delay refresh to let server settle before fetching new state
        lastRefreshStartedAtRef.current = Date.now();
        setTimeout(() => void requestRefresh({ ignoreInterval: true }), 2000);
        return extractToolResultText(result) ?? "";
      }
    } catch {
      setActionMessage("Erreur réseau");
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    app.connect().catch(() => {});
    app.ontoolresult = (result: ToolResultPayload) => { consumeToolResult(result); };
    app.ontoolinputpartial = () => { if (!dataRef.current) setLoading(true); };
  }, []);

  useEffect(() => {
    const handleFocus = () => void requestRefresh({ ignoreInterval: true });
    const handleVisibility = () => { if (document.visibilityState === "visible") void requestRefresh({ ignoreInterval: true }); };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // Auto-refresh interval (same pattern as erpnext kanban)
    const intervalId = window.setInterval(() => {
      void requestRefresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <IopoleBrandHeader />
        <div style={{ padding: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: i === 1 ? 32 : 20, width: `${40 + i * 10}%`, marginBottom: 8 }} />)}
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <IopoleBrandHeader />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16, flex: 1 }}>
          <div style={{ fontSize: 13 }}>Aucune facture à afficher</div>
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  const currency = data.currency ?? "EUR";
  const isReceived = data.direction === "received";
  const isSent = data.direction === "sent";
  const statusLower = data.status?.toLowerCase() ?? "";
  const terminalStatuses = ["accepted", "approved", "rejected", "refused", "paid", "completed", "cancelled", "payment_received"];
  const isTerminal = terminalStatuses.includes(statusLower);
  const isPreview = !emitSuccess && (statusLower === "aperçu" || statusLower === "apercu") && !!data.generated_id;
  const hasId = !!data.id && data.id !== "(aperçu)" && data.id !== "(apercu)";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <IopoleBrandHeader />
      <div style={{ padding: 16, fontFamily: fonts.sans, flex: 1 }}>
        {/* Title + Status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary }}>
              {data.invoice_number ?? data.id}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              {data.status && <StatusBadge status={data.status} />}
              {data.format && <FormatBadge format={data.format} />}
              {data.network && <span style={{ ...styles.badge(colors.text.secondary, colors.bg.elevated), fontSize: 10 }}>{data.network.replace(/_/g, " ")}</span>}
              {data.direction && (
                <span style={{ fontSize: 11, color: colors.text.muted }}>
                  {isReceived ? "Facture reçue" : "Facture émise"}
                </span>
              )}
              {data.invoice_type && (
                <span style={{ fontSize: 11, color: colors.text.faint }}>
                  — {data.invoice_type}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => void requestRefresh({ ignoreInterval: true })} disabled={refreshing} style={styles.button}>
              {refreshing ? "…" : "Rafraîchir"}
            </button>
          </div>
        </div>

        {/* Error / Action message */}
        {(error || actionMessage) && (
          <div style={{ fontSize: 12, color: error ? colors.error : colors.success, marginBottom: 12 }}>
            {error ?? actionMessage}
          </div>
        )}

        {/* Info Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          <InfoCard label="Émetteur" value={data.sender_name} sub={data.sender_id ? `SIRET ${data.sender_id}` : undefined} />
          <InfoCard label="Destinataire" value={data.receiver_name} sub={data.receiver_id ? `SIRET ${data.receiver_id}` : undefined} />
          {(data.sender_vat || data.receiver_vat) && (
            <InfoCard label="TVA" value={data.sender_vat ?? data.receiver_vat} sub={data.sender_vat && data.receiver_vat ? `Dest: ${data.receiver_vat}` : undefined} />
          )}
          <InfoCard label="Date d'émission" value={data.issue_date} />
          <InfoCard label="Date d'échéance" value={data.due_date} />
          {data.receipt_date && <InfoCard label="Date de réception" value={data.receipt_date.split("T")[0]} />}
        </div>

        {/* Line Items */}
        {data.items && data.items.length > 0 && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...styles.tableHeader, background: colors.bg.surface }}>Description</th>
                  <th style={{ ...styles.tableHeader, background: colors.bg.surface, textAlign: "right" }}>Qté</th>
                  <th style={{ ...styles.tableHeader, background: colors.bg.surface, textAlign: "right" }}>P.U.</th>
                  <th style={{ ...styles.tableHeader, background: colors.bg.surface, textAlign: "right" }}>TVA %</th>
                  <th style={{ ...styles.tableHeader, background: colors.bg.surface, textAlign: "right" }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={i}
                    style={{ transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={styles.tableCell}>{item.description ?? item.item_name ?? "—"}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right", fontFamily: fonts.mono, fontSize: 12 }}>{item.quantity ?? "—"}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right", fontFamily: fonts.mono, fontSize: 12 }}>{item.unit_price != null ? formatCurrency(item.unit_price, currency) : "—"}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right", fontFamily: fonts.mono, fontSize: 12 }}>{item.tax_rate != null ? `${item.tax_rate}%` : "—"}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right", fontFamily: fonts.mono, fontSize: 12, fontWeight: 500 }}>{item.amount != null ? formatCurrency(item.amount, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <div style={{ ...styles.card, minWidth: 220 }}>
            {data.total_ht != null && <TotalRow label="Total HT" value={formatCurrency(data.total_ht, currency)} />}
            {data.total_tax != null && <TotalRow label="TVA" value={formatCurrency(data.total_tax, currency)} />}
            {data.total_ttc != null && <TotalRow label="Total TTC" value={formatCurrency(data.total_ttc, currency)} bold />}
          </div>
        </div>

        {/* Notes */}
        {data.notes && data.notes.length > 0 && (
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Notes</div>
            {data.notes.map((note, i) => (
              <div key={i} style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 4, whiteSpace: "pre-wrap" }}>{note}</div>
            ))}
          </div>
        )}

        {/* Unified Action Buttons — contextual based on state + direction */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${colors.border}` }}>
          {/* Preview: emit button */}
          {isPreview && (
            <ActionButton label="Déposer la facture" variant="success" loading={actionLoading === "emit"}
              onClick={async () => {
                const resultText = await callAction("emit", "einvoice_invoice_emit", { generated_id: data.generated_id }, "");
                if (resultText) {
                  try {
                    const emitResponse = JSON.parse(resultText);
                    setEmitSuccess(true);
                    setActionMessage("Facture déposée");
                    hydrateData({
                      ...data,
                      id: emitResponse.id ?? data.id,
                      status: "deposited",
                      generated_id: undefined,
                    });
                  } catch {
                    setEmitSuccess(true);
                    hydrateData({ ...data, status: "deposited", generated_id: undefined });
                  }
                }
              }} />
          )}
          {/* Received invoice actions */}
          {isReceived && !isTerminal && !isPreview && (
            <>
              <ActionButton label="Accepter" variant="success" loading={actionLoading === "status_accept"}
                onClick={() => callAction("status_accept", "einvoice_status_send", { invoice_id: data.id, code: "APPROVED" }, "Facture acceptée")} />
              <ActionButton label="Rejeter" variant="error" loading={actionLoading === "status_reject"}
                onClick={() => callAction("status_reject", "einvoice_status_send", { invoice_id: data.id, code: "REFUSED" }, "Facture refusée")} />
              <ActionButton label="Contester" variant="info" loading={actionLoading === "status_dispute"}
                onClick={() => callAction("status_dispute", "einvoice_status_send", { invoice_id: data.id, code: "DISPUTED" }, "Litige signalé")} />
              <ActionButton label="Paiement envoyé" variant="success" loading={actionLoading === "status_payment_sent"}
                onClick={() => callAction("status_payment_sent", "einvoice_status_send", { invoice_id: data.id, code: "PAYMENT_SENT" }, "Paiement envoyé")} />
            </>
          )}
          {/* Sent invoice actions */}
          {isSent && !isTerminal && !isPreview && (
            <ActionButton label="Paiement reçu" variant="success" loading={actionLoading === "status_payment_received"}
              onClick={() => callAction("status_payment_received", "einvoice_status_send", { invoice_id: data.id, code: "PAYMENT_RECEIVED" }, "Paiement reçu")} />
          )}
          {/* Common actions — always available for real invoices */}
          {hasId && (
            <>
              <ActionButton label="Marquer lu" variant="default" loading={actionLoading === "mark_seen"}
                onClick={() => callAction("mark_seen", "einvoice_invoice_mark_seen", { id: data.id }, "Marquée comme lue")} />
              <ActionButton label="Télécharger PDF" variant="default" loading={actionLoading === "download_pdf"}
                onClick={() => callAction("download_pdf", "einvoice_invoice_download_readable", { id: data.id }, "PDF téléchargé")} />
            </>
          )}
        </div>
      </div>
      <IopoleBrandFooter />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function InfoCard({ label, value, sub }: { label: string; value?: string; sub?: string }) {
  return (
    <div style={styles.card}>
      <div style={{ fontSize: 11, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: bold ? 14 : 13 }}>
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span style={{ fontFamily: fonts.mono, fontWeight: bold ? 700 : 400, color: colors.text.primary }}>{value}</span>
    </div>
  );
}
