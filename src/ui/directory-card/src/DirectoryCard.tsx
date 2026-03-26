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

import { useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { t } from "~/shared/i18n";
import { PageShell } from "~/shared/PageShell";
import { FeedbackBanner } from "~/shared/Feedback";
import { useViewerLifecycle } from "~/shared/useViewerLifecycle";
import { extractToolResultText, type ToolResultPayload } from "~/shared/refresh";
import { formatAddress } from "~/shared/format";
import { InfoField } from "~/shared/InfoField";
import { ChevronIcon } from "~/shared/ChevronIcon";

const app = new App({ name: "Directory Card", version: "1.0.0" });
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
  refreshRequest?: import("~/shared/refresh").UiRefreshRequestData;
  [key: string]: unknown;
}

/** Fields handled explicitly by the card layout — excluded from "Details". */
const KNOWN_FIELDS = new Set([
  "name",
  "corporateName",
  "siren",
  "siret",
  "vatNumber",
  "address",
  "networks",
  "peppolId",
  "type",
  "refreshRequest",
]);

// ============================================================================
// Parse payload
// ============================================================================

/** Normalize incoming payload: single object or array (take first element). */
function normalizePayload(raw: unknown): DirectoryResult | null {
  if (Array.isArray(raw)) {
    return raw.length > 0 ? (raw[0] as DirectoryResult) : null;
  }
  if (raw && typeof raw === "object") return raw as DirectoryResult;
  return null;
}

function parseDirectoryCardPayload(
  result: ToolResultPayload,
): import("~/shared/useViewerLifecycle").ParsePayloadResult<DirectoryResult> {
  const text = extractToolResultText(result);
  if (!text) return null;
  try {
    const parsed = normalizePayload(JSON.parse(text));
    if (!parsed) return { error: t("no_results") };
    return { data: parsed };
  } catch {
    return { error: t("error_parsing") };
  }
}

// ============================================================================
// Sub-components
// ============================================================================

function NetworkBadge({ network }: { network: DirectoryNetwork }) {
  const isActive = !network.status || network.status.toLowerCase() === "active";
  const badgeColor = isActive ? colors.success : colors.text.faint;
  const badgeBg = isActive ? colors.successDim : colors.bg.elevated;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: badgeBg,
        border: `1px solid ${isActive ? colors.success : colors.border}`,
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600, color: badgeColor }}>
        {network.scheme}
      </span>
      <span
        style={{
          color: colors.text.secondary,
          fontFamily: fonts.mono,
          fontSize: 11,
        }}
      >
        {network.value}
      </span>
      {network.status && (
        <span style={styles.badge(badgeColor, badgeBg)}>{network.status}</span>
      )}
    </div>
  );
}

function formatUnknownValue(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
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
        aria-expanded={expanded}
        style={{
          ...styles.button,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
        }}
      >
        <ChevronIcon expanded={expanded} />
        {t("details")} ({extraEntries.length})
      </button>

      {expanded && (
        <div
          style={{
            marginTop: 8,
            borderTop: `1px solid ${colors.border}`,
            paddingTop: 8,
          }}
        >
          {extraEntries.map(([key, value]) => (
            <div
              key={key}
              style={{
                display: "flex",
                gap: 12,
                padding: "4px 0",
                borderBottom: `1px solid ${colors.borderSubtle}`,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: colors.text.muted,
                  minWidth: 120,
                  fontWeight: 500,
                }}
              >
                {key}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: colors.text.primary,
                  fontFamily: typeof value === "object"
                    ? fonts.mono
                    : fonts.sans,
                  whiteSpace: typeof value === "object" ? "pre-wrap" : "normal",
                  wordBreak: "break-word",
                }}
              >
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
  const {
    data,
    loading,
    refreshing,
    error,
    onRefresh,
    onError,
  } = useViewerLifecycle<DirectoryResult>({
    app,
    minIntervalMs: REFRESH_THROTTLE_MS,
    parsePayload: parseDirectoryCardPayload,
  });

  // ── Loading skeleton ──────────────────────────────────────────

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: 24 }}>
          <div
            className="skeleton"
            style={{ height: 28, width: "60%", marginBottom: 12 }}
          />
          <div
            className="skeleton"
            style={{ height: 16, width: "30%", marginBottom: 20 }}
          />
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 60 }} />
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Empty state ───────────────────────────────────────────────

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
            color: colors.text.muted,
            gap: 16,
            height: "100%",
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 56 56"
            fill="none"
            style={{ opacity: 0.35 }}
          >
            <rect
              x="8"
              y="8"
              width="40"
              height="40"
              rx="8"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="28"
              cy="22"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M16 42c0-6.627 5.373-12 12-12s12 5.373 12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ fontSize: 13 }}>{t("no_company")}</div>
        </div>
      </PageShell>
    );
  }

  // ── Card content ──────────────────────────────────────────────

  const companyName = data.name || data.corporateName || "\u2014";
  const hasAddress = data.address &&
    (data.address.street || data.address.city || data.address.postalCode ||
      data.address.country);
  const hasNetworks = data.networks && data.networks.length > 0;

  return (
    <PageShell>
      <div style={{ padding: 16, fontFamily: fonts.sans }}>
        {/* ── Title + Type Badge ────────────────────────────────── */}
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
          <div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: colors.text.primary,
                lineHeight: 1.3,
              }}
            >
              {companyName}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 6,
                alignItems: "center",
              }}
            >
              {data.type && (
                <span style={styles.badge(colors.accent, colors.accentDim)}>
                  {data.type}
                </span>
              )}
              {data.peppolId && (
                <span
                  style={{
                    fontSize: 11,
                    color: colors.text.muted,
                    fontFamily: fonts.mono,
                  }}
                >
                  Peppol: {data.peppolId}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={styles.button}
            >
              {refreshing ? "\u2026" : t("refresh")}
            </button>
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────── */}
        {error && (
          <FeedbackBanner
            type="error"
            message={error}
            onDismiss={() => onError(null)}
          />
        )}

        {/* ── Info Grid ────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {data.siren != null && <InfoField label="SIREN" value={data.siren} />}
          {data.siret != null && <InfoField label="SIRET" value={data.siret} />}
          {data.vatNumber != null && (
            <InfoField label={t("vat_intra")} value={data.vatNumber} />
          )}
          {hasAddress && (
            <InfoField
              label={t("address")}
              value={formatAddress(data.address!)}
            />
          )}
          {data.address?.country && !hasAddress && (
            <InfoField label={t("country")} value={data.address.country} />
          )}
        </div>

        {/* ── Networks ─────────────────────────────────────────── */}
        {hasNetworks && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                color: colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {t("networks")}
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
    </PageShell>
  );
}
