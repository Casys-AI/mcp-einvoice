/**
 * Status Timeline — E-Invoice
 *
 * Displays the status history of an invoice as a vertical timeline.
 * Data comes from the `einvoice_status_history` tool (Iopole API).
 *
 * Visual: left = date/time, center = vertical line + dots, right = status badge + destType.
 * Most recent status at top. Latest dot is larger with a pulse animation.
 */

import { useState, useEffect, useRef, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { IopoleBrandHeader, IopoleBrandFooter } from "~/shared/IopoleBrand";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";

const app = new App({ name: "Status Timeline", version: "1.0.0" });
const TOOL_CALL_TIMEOUT_MS = 10_000;
const REFRESH_THROTTLE_MS = 15_000;

// ============================================================================
// Types — Iopole status history data shape
// ============================================================================

interface StatusEntry {
  invoiceId: string;
  statusId: string;
  date: string;        // ISO 8601
  destType: string;    // "PLATFORM", "BUYER", etc.
  status: {
    code: string;      // "DELIVERED", "PAYMENT_SENT", "ACCEPTED", etc.
  };
  xml?: string;        // Raw XML — not displayed
}

interface TimelineData {
  entries: StatusEntry[];
  refreshRequest?: UiRefreshRequestData;
}

// ============================================================================
// Status colors — lifecycle stage mapping
// ============================================================================

const STATUS_SCHEME: Record<string, { color: string; bg: string; label: string }> = {
  DEPOSITED:        { color: colors.info,        bg: colors.infoDim,      label: "Déposée" },
  DELIVERED:        { color: colors.info,        bg: colors.infoDim,      label: "Livrée" },
  RECEIVED:         { color: colors.info,        bg: colors.infoDim,      label: "Reçue" },
  ACCEPTED:         { color: colors.success,     bg: colors.successDim,   label: "Acceptée" },
  PAYMENT_SENT:     { color: colors.success,     bg: colors.successDim,   label: "Paiement envoyé" },
  PAYMENT_RECEIVED: { color: colors.success,     bg: colors.successDim,   label: "Paiement reçu" },
  REJECTED:         { color: colors.error,       bg: colors.errorDim,     label: "Rejetée" },
  REFUSED:          { color: colors.error,       bg: colors.errorDim,     label: "Refusée" },
  DISPUTED:         { color: colors.warning,     bg: colors.warningDim,   label: "Litigieuse" },
  CANCELLED:        { color: colors.text.faint,  bg: colors.bg.elevated,  label: "Annulée" },
};

function getStatusScheme(code: string) {
  return STATUS_SCHEME[code.toUpperCase()] ?? {
    color: colors.text.muted,
    bg: colors.bg.elevated,
    label: code,
  };
}

// ============================================================================
// Date formatting — French locale
// ============================================================================

function formatDate(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

// ============================================================================
// Dest type labels
// ============================================================================

const DEST_TYPE_LABELS: Record<string, string> = {
  PLATFORM: "Plateforme",
  BUYER: "Acheteur",
  SELLER: "Vendeur",
  TAX_AUTHORITY: "Administration fiscale",
};

function formatDestType(destType: string): string {
  return DEST_TYPE_LABELS[destType.toUpperCase()] ?? destType;
}

// ============================================================================
// Inline keyframes for pulse animation (injected once)
// ============================================================================

const PULSE_KEYFRAMES = `
@keyframes status-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--dot-pulse-color, rgba(37, 99, 235, 0.4)); }
  50% { box-shadow: 0 0 0 4px var(--dot-pulse-color, rgba(37, 99, 235, 0)); }
}
`;

let pulseInjected = false;
function injectPulseKeyframes() {
  if (pulseInjected) return;
  pulseInjected = true;
  const style = document.createElement("style");
  style.textContent = PULSE_KEYFRAMES;
  document.head.appendChild(style);
}

// ============================================================================
// Main Component
// ============================================================================

export function StatusTimeline() {
  const [entries, setEntries] = useState<StatusEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<TimelineData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  useEffect(() => { injectPulseKeyframes(); }, []);

  function hydrateData(raw: unknown) {
    // The tool returns a JSON array of StatusEntry directly,
    // or an object with { entries, refreshRequest }.
    let parsed: TimelineData;
    if (Array.isArray(raw)) {
      parsed = { entries: raw as StatusEntry[] };
    } else if (raw && typeof raw === "object" && "entries" in raw) {
      parsed = raw as TimelineData;
    } else if (raw && typeof raw === "object") {
      // Wrap single entry
      parsed = { entries: [raw as StatusEntry] };
    } else {
      return;
    }

    // Sort most recent first
    parsed.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    dataRef.current = parsed;
    refreshRequestRef.current = resolveUiRefreshRequest(parsed, refreshRequestRef.current);
    setEntries(parsed.entries);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      hydrateData(JSON.parse(text));
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
      minIntervalMs: REFRESH_THROTTLE_MS,
    }, options)) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({ name: request.toolName, arguments: request.arguments }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (!result.isError) consumeToolResult(result);
      else setError("Echec du rafraichissement");
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
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
    return () => { window.removeEventListener("focus", handleFocus); document.removeEventListener("visibilitychange", handleVisibility); };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <IopoleBrandHeader />
        <div style={{ padding: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center" }}>
              <div className="skeleton" style={{ width: 80, height: 14 }} />
              <div className="skeleton" style={{ width: 8, height: 8, borderRadius: "50%" }} />
              <div className="skeleton" style={{ width: `${30 + i * 12}%`, height: 14 }} />
            </div>
          ))}
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────

  if (!entries || entries.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <IopoleBrandHeader />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16, flex: 1 }}>
          <div style={{ fontSize: 13 }}>Aucun historique de statut</div>
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  // ── Timeline ──────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <IopoleBrandHeader />
      <div style={{ padding: 16, fontFamily: fonts.sans, flex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>
            Historique des statuts
          </div>
          <button onClick={() => void requestRefresh({ ignoreInterval: true })} disabled={refreshing} style={styles.button}>
            {refreshing ? "..." : "Rafra\u00eechir"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: 12, color: colors.error, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Timeline entries */}
        <div style={{ position: "relative" }}>
          {entries.map((entry, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === entries.length - 1;
            const scheme = getStatusScheme(entry.status.code);
            const { date, time } = formatDate(entry.date);
            const dotSize = isFirst ? 8 : 6;

            return (
              <div key={entry.statusId || idx} style={{ display: "flex", gap: 0, minHeight: 56 }}>
                {/* Left — date + time */}
                <div style={{
                  width: 90,
                  flexShrink: 0,
                  textAlign: "right",
                  paddingRight: 16,
                  paddingTop: 2,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.secondary, lineHeight: "1.3" }}>
                    {date}
                  </div>
                  <div style={{ fontSize: 11, color: colors.text.faint, fontFamily: fonts.mono }}>
                    {time}
                  </div>
                </div>

                {/* Center — line + dot */}
                <div style={{
                  position: "relative",
                  width: 20,
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                }}>
                  {/* Vertical line segment */}
                  {!isLast && (
                    <div style={{
                      position: "absolute",
                      top: dotSize / 2 + 2,
                      bottom: 0,
                      left: "50%",
                      width: 2,
                      transform: "translateX(-50%)",
                      background: colors.border,
                    }} />
                  )}
                  {/* Dot */}
                  <div style={{
                    position: "relative",
                    top: 2,
                    width: dotSize,
                    height: dotSize,
                    borderRadius: "50%",
                    background: scheme.color,
                    flexShrink: 0,
                    zIndex: 1,
                    ...(isFirst ? {
                      animation: "status-dot-pulse 2s ease-in-out infinite",
                      // The CSS variable drives the pulse glow color
                    } : {}),
                  } as CSSProperties} />
                </div>

                {/* Right — status badge + dest type */}
                <div style={{
                  paddingLeft: 12,
                  paddingBottom: 20,
                  flex: 1,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={styles.badge(scheme.color, scheme.bg)}>
                      {scheme.label}
                    </span>
                    <span style={{ fontSize: 11, color: colors.text.muted }}>
                      {formatDestType(entry.destType)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <IopoleBrandFooter />
    </div>
  );
}
