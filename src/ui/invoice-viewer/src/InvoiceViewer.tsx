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

import { useState, useEffect, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatCurrency } from "~/shared/theme";
import { IopoleBrandHeader, IopoleBrandFooter } from "~/shared/IopoleBrand";
import { FeedbackBanner, EmptyInvoiceIcon } from "~/shared/Feedback";
import { getStatus, canAcceptReject as canAccept, canSendPayment as canPay, canReceivePayment as canReceivePay } from "~/shared/status";
import { ActionButton } from "~/shared/ActionButton";
import { InfoCard } from "~/shared/InfoCard";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";

const app = new App({ name: "Invoice Viewer", version: "1.0.0" });

/** Action keys for loading state tracking */
const AK = {
  EMIT: "emit",
  ACCEPT: "status_accept",
  REJECT: "status_reject",
  DISPUTE: "status_dispute",
  PAYMENT_SENT: "status_payment_sent",
  PAYMENT_RECEIVED: "status_payment_received",

  DOWNLOAD_PDF: "download_pdf",
} as const;
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 30_000;

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
  generated_id?: string; // From generate preview — used to emit via einvoice_invoice_submit
  refreshRequest?: UiRefreshRequestData;
}

// ============================================================================
// Status colors — French e-invoicing lifecycle
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const s = getStatus(status);
  return <span style={styles.badge(s.color, s.bg)}>{s.label}</span>;
}

function FormatBadge({ format }: { format: string }) {
  return <span style={{ ...styles.badge(colors.text.secondary, colors.bg.elevated), textTransform: "uppercase" as const }}>{format}</span>;
}

// ============================================================================
// Action Buttons — interactive tool calls
// ============================================================================

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 12, flex: 1 }}>
          <EmptyInvoiceIcon />
          <div style={{ fontSize: 13 }}>Aucune facture à afficher</div>
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  const currency = data.currency ?? "EUR";
  const isReceived = data.direction === "received";
  const statusStr = data.status ?? "";
  const statusLower = statusStr.toLowerCase();
  const dir = data.direction ?? "";
  const isPreview = !emitSuccess && (statusLower === "aperçu" || statusLower === "apercu") && !!data.generated_id;
  const hasId = !!data.id && data.id !== "(aperçu)" && data.id !== "(apercu)";

  // Lifecycle transition guards (from shared status module)
  const showAcceptReject = canAccept(statusStr, dir);
  const showSendPayment = canPay(statusStr, dir);
  const showReceivePayment = canReceivePay(statusStr, dir);

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
              {data.direction && !isPreview && (
                <span style={{ fontSize: 11, color: colors.text.muted }}>
                  {isReceived ? "Entrante" : "Sortante"}
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
        {error && <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />}
        {!error && actionMessage && <FeedbackBanner type="success" message={actionMessage} />}

        {/* Parties — two columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Émetteur</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>{data.sender_name ?? "—"}</div>
            {data.sender_id && <div style={{ fontSize: 11, color: colors.text.secondary }}>SIRET {data.sender_id}</div>}
            {data.sender_vat && <div style={{ fontSize: 11, color: colors.text.faint }}>TVA {data.sender_vat}</div>}
          </div>
          <div>
            <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Destinataire</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>{data.receiver_name ?? "—"}</div>
            {data.receiver_id && <div style={{ fontSize: 11, color: colors.text.secondary }}>SIRET {data.receiver_id}</div>}
            {data.receiver_vat && <div style={{ fontSize: 11, color: colors.text.faint }}>TVA {data.receiver_vat}</div>}
          </div>
        </div>

        {/* Dates — inline */}
        <div style={{ display: "flex", gap: 24, marginBottom: 16, fontSize: 12 }}>
          {data.issue_date && <span><span style={{ color: colors.text.muted }}>Émission </span><span style={{ color: colors.text.primary, fontWeight: 500 }}>{data.issue_date}</span></span>}
          {data.due_date && <span><span style={{ color: colors.text.muted }}>Échéance </span><span style={{ color: colors.text.primary, fontWeight: 500 }}>{data.due_date}</span></span>}
          {data.receipt_date && <span><span style={{ color: colors.text.muted }}>Réception </span><span style={{ color: colors.text.primary, fontWeight: 500 }}>{data.receipt_date.split("T")[0]}</span></span>}
        </div>

        {/* Line Items */}
        {data.items && data.items.length > 0 && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflowX: "auto", marginBottom: 16 }}>
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

        {/* Totals — aligned right */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <div style={{ minWidth: 220, borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
            {data.total_ht != null && <TotalRow label="Total HT" value={formatCurrency(data.total_ht, currency)} />}
            {data.total_tax != null && <TotalRow label="TVA" value={formatCurrency(data.total_tax, currency)} />}
            {data.total_ttc != null && <TotalRow label="Total TTC" value={formatCurrency(data.total_ttc, currency)} bold />}
          </div>
        </div>

        {/* Notes */}
        {data.notes && data.notes.length > 0 && (
          <div style={{ marginBottom: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Notes</div>
            {data.notes.map((note, i) => (
              <div key={i} style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 4, whiteSpace: "pre-wrap" }}>{note}</div>
            ))}
          </div>
        )}

        {/* Action Buttons — sequential per lifecycle */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${colors.border}` }}>
          {/* Preview: emit */}
          {isPreview && (
            <ActionButton label="Soumettre la facture" variant="success" confirm loading={actionLoading === AK.EMIT}
              onClick={async () => {
                const resultText = await callAction(AK.EMIT, "einvoice_invoice_submit", { generated_id: data.generated_id }, "");
                if (resultText) {
                  try {
                    const emitResponse = JSON.parse(resultText);
                    setEmitSuccess(true);
                    setActionMessage("Facture soumise");
                    hydrateData({ ...data, id: emitResponse.id ?? data.id, status: "submitted", generated_id: undefined });
                  } catch {
                    setEmitSuccess(true);
                    hydrateData({ ...data, status: "submitted", generated_id: undefined });
                  }
                }
              }} />
          )}
          {/* Received: accept/reject/dispute — only when DELIVERED or IN_HAND or DISPUTED */}
          {showAcceptReject && (
            <>
              <ActionButton label="Accepter" variant="success" loading={actionLoading === AK.ACCEPT}
                onClick={() => callAction(AK.ACCEPT, "einvoice_status_send", { invoice_id: data.id, code: "APPROVED" }, "Facture acceptée")} />
              <ActionButton label="Rejeter" variant="error" confirm loading={actionLoading === AK.REJECT}
                onClick={() => callAction(AK.REJECT, "einvoice_status_send", { invoice_id: data.id, code: "REFUSED" }, "Facture refusée")} />
              <ActionButton label="Contester" variant="info" confirm loading={actionLoading === AK.DISPUTE}
                onClick={() => callAction(AK.DISPUTE, "einvoice_status_send", { invoice_id: data.id, code: "DISPUTED" }, "Litige signalé")} />
            </>
          )}
          {/* Received: payment — only when APPROVED */}
          {showSendPayment && (
            <ActionButton label="Paiement envoyé" variant="success" loading={actionLoading === AK.PAYMENT_SENT}
              onClick={() => callAction(AK.PAYMENT_SENT, "einvoice_status_send", { invoice_id: data.id, code: "PAYMENT_SENT" }, "Paiement envoyé")} />
          )}
          {/* Sent: payment received — only when APPROVED or DELIVERED */}
          {showReceivePayment && (
            <ActionButton label="Paiement reçu" variant="success" loading={actionLoading === AK.PAYMENT_RECEIVED}
              onClick={() => callAction(AK.PAYMENT_RECEIVED, "einvoice_status_send", { invoice_id: data.id, code: "PAYMENT_RECEIVED" }, "Paiement reçu")} />
          )}
          {/* Common: always available for real invoices */}
          {hasId && (
            <ActionButton label="Télécharger PDF" variant="default" loading={actionLoading === AK.DOWNLOAD_PDF}
              onClick={() => callAction(AK.DOWNLOAD_PDF, "einvoice_invoice_download_readable", { id: data.id }, "PDF téléchargé")} />
          )}
        </div>

        {/* Navigation — send message to conversation so Claude opens the right viewer */}
        {hasId && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 12 }}>
            <ActionButton label="Historique statuts" variant="default" loading={actionLoading === "nav_history"}
              onClick={async () => {
                setActionLoading("nav_history");
                try {
                  await app.sendMessage({
                    role: "user",
                    content: [{ type: "text", text: `Montre-moi l'historique des statuts de la facture ${data.id}` }],
                  });
                } catch { /* host may not support sendMessage */ }
                setActionLoading(null);
              }} />
            {data.sender_id && (
              <ActionButton label="Voir émetteur" variant="default" loading={actionLoading === "nav_dir_sender"}
                onClick={async () => {
                  setActionLoading("nav_dir_sender");
                  try {
                    await app.sendMessage({
                      role: "user",
                      content: [{ type: "text", text: `Recherche l'entité avec le SIRET ${data.sender_id} dans l'annuaire français` }],
                    });
                  } catch { /* host may not support sendMessage */ }
                  setActionLoading(null);
                }} />
            )}
          </div>
        )}
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
