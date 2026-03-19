/**
 * Directory Card — E-Invoice
 *
 * Displays a company card from French or international directory search results.
 * Data comes from `einvoice_directory_fr_search` or `einvoice_directory_int_search`.
 *
 * - Header: company name + type badge
 * - Info grid: SIREN, SIRET, TVA, address, country
 * - Networks section: Peppol, PPF, etc.
 * - Expandable "Details" for extra unknown fields
 */

import { useState, useEffect, useRef } from "react";
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

const app = new App({ name: "Directory Card", version: "1.0.0" });
const TOOL_CALL_TIMEOUT_MS = 10_000;
const REFRESH_THROTTLE_MS = 15_000;

// ============================================================================
// Types — Directory search result
// ============================================================================

interface DirectoryNetwork {
  scheme: string;
  value: string;
  status?: string;
}

interface DirectoryAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

interface DirectoryResult {
  name?: string;
  corporateName?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
  address?: DirectoryAddress;
  networks?: DirectoryNetwork[];
  peppolId?: string;
  type?: string;
  refreshRequest?: UiRefreshRequestData;
  [key: string]: unknown;
}

/** Fields handled explicitly by the card layout — excluded from "Details". */
const KNOWN_FIELDS = new Set([
  "name", "corporateName", "siren", "siret", "vatNumber",
  "address", "networks", "peppolId", "type", "refreshRequest",
]);

// ============================================================================
// Sub-components
// ============================================================================

function InfoField({ label, value, sub }: { label: string; value?: string; sub?: string }) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{value ?? "\u2014"}</div>
      {sub && <div style={{ fontSize: 10, color: colors.text.faint, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function NetworkBadge({ network }: { network: DirectoryNetwork }) {
  const isActive = !network.status || network.status.toLowerCase() === "active";
  const badgeColor = isActive ? colors.success : colors.text.faint;
  const badgeBg = isActive ? colors.successDim : colors.bg.elevated;

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      background: badgeBg,
      border: `1px solid ${isActive ? colors.success : colors.border}`,
      borderRadius: 6,
      fontSize: 12,
    }}>
      <span style={{ fontWeight: 600, color: badgeColor }}>{network.scheme}</span>
      <span style={{ color: colors.text.secondary, fontFamily: fonts.mono, fontSize: 11 }}>{network.value}</span>
      {network.status && (
        <span style={styles.badge(badgeColor, badgeBg)}>{network.status}</span>
      )}
    </div>
  );
}

function formatAddress(addr: DirectoryAddress): string {
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  if (addr.postalCode || addr.city) {
    parts.push([addr.postalCode, addr.city].filter(Boolean).join(" "));
  }
  if (addr.country) parts.push(addr.country);
  return parts.join(", ") || "\u2014";
}

function formatUnknownValue(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function DetailsSection({ data }: { data: DirectoryResult }) {
  const [expanded, setExpanded] = useState(false);

  const extraEntries = Object.entries(data).filter(
    ([key, value]) => !KNOWN_FIELDS.has(key) && value != null,
  );

  if (extraEntries.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          ...styles.button,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        D{"\u00e9"}tails ({extraEntries.length})
      </button>

      {expanded && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
          {extraEntries.map(([key, value]) => (
            <div key={key} style={{ display: "flex", gap: 12, padding: "4px 0", borderBottom: `1px solid ${colors.borderSubtle}` }}>
              <span style={{ fontSize: 12, color: colors.text.muted, minWidth: 120, fontWeight: 500 }}>{key}</span>
              <span style={{
                fontSize: 12,
                color: colors.text.primary,
                fontFamily: typeof value === "object" ? fonts.mono : fonts.sans,
                whiteSpace: typeof value === "object" ? "pre-wrap" : "normal",
                wordBreak: "break-word",
              }}>
                {formatUnknownValue(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DirectoryCard() {
  const [data, setData] = useState<DirectoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<DirectoryResult | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: DirectoryResult) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(nextData, refreshRequestRef.current);
    setData(nextData);
  }

  /** Normalize incoming payload: single object or array (take first element). */
  function normalizePayload(raw: unknown): DirectoryResult | null {
    if (Array.isArray(raw)) {
      return raw.length > 0 ? (raw[0] as DirectoryResult) : null;
    }
    if (raw && typeof raw === "object") return raw as DirectoryResult;
    return null;
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = normalizePayload(JSON.parse(text));
      if (!parsed) {
        setError("Aucun résultat");
        setLoading(false);
        return false;
      }
      hydrateData(parsed);
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
      else setError("Échec du rafraîchissement");
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

  // ── Loading skeleton ──────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <IopoleBrandHeader />
        <div style={{ padding: 24 }}>
          <div className="skeleton" style={{ height: 28, width: "60%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: "30%", marginBottom: 20 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 60 }} />
            ))}
          </div>
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <IopoleBrandHeader />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16, flex: 1 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
            <rect x="8" y="8" width="40" height="40" rx="8" stroke="currentColor" strokeWidth="2" />
            <circle cx="28" cy="22" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 42c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 13 }}>Aucune entreprise à afficher</div>
        </div>
        <IopoleBrandFooter />
      </div>
    );
  }

  // ── Card content ──────────────────────────────────────────────

  const companyName = data.name || data.corporateName || "\u2014";
  const hasAddress = data.address && (data.address.street || data.address.city || data.address.postalCode || data.address.country);
  const hasNetworks = data.networks && data.networks.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <IopoleBrandHeader />
      <div style={{ padding: 16, fontFamily: fonts.sans, flex: 1 }}>

        {/* ── Title + Type Badge ────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: colors.text.primary, lineHeight: 1.3 }}>
              {companyName}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              {data.type && (
                <span style={styles.badge(colors.accent, colors.accentDim)}>{data.type}</span>
              )}
              {data.peppolId && (
                <span style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono }}>
                  Peppol: {data.peppolId}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => void requestRefresh({ ignoreInterval: true })} disabled={refreshing} style={styles.button}>
              {refreshing ? "\u2026" : "Rafra\u00eechir"}
            </button>
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────── */}
        {error && (
          <div style={{ fontSize: 12, color: colors.error, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* ── Info Grid ────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          {data.siren != null && <InfoField label="SIREN" value={data.siren} />}
          {data.siret != null && <InfoField label="SIRET" value={data.siret} />}
          {data.vatNumber != null && <InfoField label="TVA intracommunautaire" value={data.vatNumber} />}
          {hasAddress && <InfoField label="Adresse" value={formatAddress(data.address!)} />}
          {data.address?.country && !hasAddress && <InfoField label="Pays" value={data.address.country} />}
        </div>


        {/* ── Networks ─────────────────────────────────────────── */}
        {hasNetworks && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 }}>
              Réseaux
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.networks!.map((net, i) => (
                <NetworkBadge key={i} network={net} />
              ))}
            </div>
          </div>
        )}

        {/* ── Extra fields ─────────────────────────────────────── */}
        <DetailsSection data={data} />
      </div>
      <IopoleBrandFooter />
    </div>
  );
}
