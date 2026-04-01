/**
 * Directory List — E-Invoice
 *
 * Card-based list viewer for French/international directory search results.
 * Each result is an expandable card showing company info + network registrations.
 * Data comes from `einvoice_directory_fr_search` / `einvoice_directory_int_search`.
 *
 * Design: Stitch "Amber Ledger" (.stitch/designs/directory-cards.html)
 */

import { useMemo, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { t } from "~/shared/i18n";
import { PageShell } from "~/shared/PageShell";
import { hoverRowHandlers } from "~/shared/useHoverRow";
import { FeedbackBanner } from "~/shared/Feedback";
import { useViewerLifecycle } from "~/shared/useViewerLifecycle";
import { extractToolResultText, type ToolResultPayload } from "~/shared/refresh";
import { formatAddress } from "~/shared/format";
import { InfoField } from "~/shared/InfoField";
import { ChevronIcon } from "~/shared/ChevronIcon";

const app = new App({ name: "Directory List", version: "1.0.0" });
const REFRESH_THROTTLE_MS = 15_000;

// ── Types ────────────────────────────────────────────────

interface NetworkRegistration {
  directoryAddress?: string;
  networkIdentifier?: string;
  directoryId?: string;
}

interface DirectoryNetwork {
  scheme: string;
  value: string;
  type?: string;
  status?: string;
  businessEntityIdentifierId?: string;
  networkRegistered?: NetworkRegistration[];
}

interface DirectoryEntry {
  name?: string;
  corporateName?: string;
  type?: string;
  siren?: string;
  siret?: string;
  country?: string;
  directory?: string;
  status?: string;
  createdAt?: string;
  identifiers?: DirectoryNetwork[];
  vatNumber?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

interface DirectoryListData {
  data: Array<
    { _id?: string; _detail?: DirectoryEntry; [key: string]: unknown }
  >;
  count?: number;
  _title?: string;
  refreshRequest?: import("~/shared/refresh").UiRefreshRequestData;
}

// ── Parse payload ────────────────────────────────────────

function normalizePayload(raw: unknown): DirectoryListData | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return { data: raw, count: raw.length };
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj as DirectoryListData;
  return { data: [obj as Record<string, unknown>], count: 1 };
}

function parseDirectoryListPayload(
  result: ToolResultPayload,
): import("~/shared/useViewerLifecycle").ParsePayloadResult<DirectoryListData> {
  const text = extractToolResultText(result);
  if (!text) return null;
  try {
    const parsed = normalizePayload(JSON.parse(text));
    if (!parsed || parsed.data.length === 0) {
      return { error: t("no_results") };
    }
    return { data: parsed };
  } catch {
    return { error: t("error_parsing") };
  }
}

// ── Sub-components ───────────────────────────────────────

const NETWORK_LABELS: Record<string, string> = {
  DOMESTIC_FR: "PPF France",
  PEPPOL_INTERNATIONAL: "Peppol",
};

function NetworkRow({ network }: { network: DirectoryNetwork }) {
  const isActive = !network.status || network.status.toLowerCase() === "active";
  const registrations = network.networkRegistered ?? [];
  return (
    <div
      style={{
        borderLeft: `2px solid ${colors.accent}`,
        background: colors.bg.root,
        borderRadius: "0 6px 6px 0",
        marginBottom: 4,
        padding: "8px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontWeight: 700,
            color: colors.accent,
            fontSize: 11,
            minWidth: 45,
          }}
        >
          {network.scheme}
        </span>
        <span
          style={{
            color: colors.text.secondary,
            fontFamily: fonts.mono,
            fontSize: 11,
            flex: 1,
          }}
        >
          {network.value}
        </span>
        {isActive && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle
              cx="7"
              cy="7"
              r="6"
              stroke={colors.success}
              strokeWidth="1.5"
            />
            <path
              d="M4 7l2 2 4-4"
              stroke={colors.success}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      {registrations.length > 0 && (
        <div style={{ marginTop: 6, paddingLeft: 53 }}>
          {registrations.map((reg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 2,
              }}
            >
              {reg.networkIdentifier && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: colors.text.muted,
                    background: colors.bg.elevated,
                    borderRadius: 4,
                    padding: "1px 5px",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {NETWORK_LABELS[reg.networkIdentifier] ??
                    reg.networkIdentifier}
                </span>
              )}
              {reg.directoryAddress && (
                <span
                  style={{
                    fontSize: 10,
                    color: colors.text.faint,
                    fontFamily: fonts.mono,
                  }}
                >
                  {reg.directoryAddress}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card component ───────────────────────────────────────

function DirectoryEntryCard({ entry, expanded, onToggle }: {
  entry: DirectoryEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const companyName = entry.name || entry.corporateName || "—";
  const networks = entry.identifiers ?? [];
  const hasAddress = entry.address &&
    (entry.address.street || entry.address.city);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      style={{
        background: expanded ? colors.bg.elevated : colors.bg.surface,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        transition: "background 0.15s",
        marginBottom: 8,
      }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      {...hoverRowHandlers(colors.bg.surface, expanded)}
    >
      {/* Collapsed header */}
      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            {entry.type && (
              <span
                style={{
                  ...styles.badge(colors.accent, colors.accentDim),
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {entry.type}
              </span>
            )}
            {entry.country && (
              <span
                style={{ fontSize: 10, color: colors.text.faint, opacity: 0.6 }}
              >
                {entry.country}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.primary,
              marginBottom: 2,
            }}
          >
            {companyName}
          </div>
          {entry.siret && (
            <div
              style={{
                fontSize: 11,
                fontFamily: fonts.mono,
                color: colors.text.secondary,
              }}
            >
              SIRET {entry.siret}
            </div>
          )}
        </div>
        <ChevronIcon
          expanded={expanded}
          style={{ flexShrink: 0, opacity: 0.4 }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: `2px solid ${colors.accent}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 12,
              marginBottom: 12,
            }}
          >
            {entry.siren && <InfoField label="SIREN" value={entry.siren} mono />}
            {entry.vatNumber && (
              <InfoField label={t("vat_intra")} value={entry.vatNumber} mono />
            )}
            {entry.directory && (
              <InfoField label="Directory" value={entry.directory} mono />
            )}
            {entry.status && <InfoField label="Status" value={entry.status} mono />}
          </div>

          {hasAddress && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 10,
                  color: colors.text.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {t("address")}
              </div>
              <div style={{ fontSize: 12, color: colors.text.secondary }}>
                {formatAddress(entry.address!)}
              </div>
            </div>
          )}

          {networks.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: colors.text.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                {t("networks")}
              </div>
              {networks.map((net, i) => <NetworkRow key={i} network={net} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            background: colors.bg.surface,
            borderRadius: 12,
            padding: 14,
            marginBottom: 8,
          }}
        >
          <div
            className="skeleton"
            style={{ width: 80, height: 14, marginBottom: 8 }}
          />
          <div
            className="skeleton"
            style={{ width: `${50 + i * 10}%`, height: 18, marginBottom: 6 }}
          />
          <div className="skeleton" style={{ width: 140, height: 12 }} />
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────

export function DirectoryList() {
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data,
    loading,
    refreshing,
    error,
    onRefresh,
    onError,
  } = useViewerLifecycle<DirectoryListData>({
    app,
    minIntervalMs: REFRESH_THROTTLE_MS,
    parsePayload: parseDirectoryListPayload,
  });

  // ── Filtered entries ────────────────────────────────────

  const entries = useMemo(() => {
    if (!data) return [];
    const rows = data.data ?? [];
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) => {
      const d = row._detail;
      if (!d) return true;
      return (d.name?.toLowerCase().includes(q)) ||
        (d.corporateName?.toLowerCase().includes(q)) ||
        (d.siret?.includes(q)) ||
        (d.siren?.includes(q)) ||
        (d.country?.toLowerCase().includes(q));
    });
  }, [data, filter]);

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell>
        <LoadingSkeleton />
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
          <div style={{ fontSize: 13 }}>{error ?? t("no_company")}</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell refreshing={refreshing}>
      <div style={{ padding: 16, fontFamily: fonts.sans }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: colors.text.primary,
              }}
            >
              {data._title ?? t("details")}
            </div>
            <div style={{ fontSize: 12, color: colors.text.muted }}>
              {entries.length} {t("results")}
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={styles.button}
          >
            {refreshing ? "…" : t("refresh")}
          </button>
        </div>

        {/* Error */}
        {error && (
          <FeedbackBanner
            type="error"
            message={error}
            onDismiss={() => onError(null)}
          />
        )}

        {/* Search */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder={t("search")}
            aria-label={t("search")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              ...styles.input,
              background: colors.bg.elevated,
              border: "none",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              width: "100%",
            }}
          />
        </div>

        {/* Cards or empty filter message */}
        {entries.length === 0 && filter && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              color: colors.text.muted,
              fontSize: 13,
            }}
          >
            {t("no_results")}
          </div>
        )}
        {entries.map((row, idx) => {
          const entry = (row._detail ?? row) as DirectoryEntry;
          const id = String(row._id ?? idx);
          return (
            <DirectoryEntryCard
              key={id}
              entry={entry}
              expanded={expandedId === id}
              onToggle={() => setExpandedId(expandedId === id ? null : id)}
            />
          );
        })}
      </div>
    </PageShell>
  );
}
