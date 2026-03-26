/**
 * Status Timeline — E-Invoice
 *
 * Displays the status history of an invoice as a vertical timeline.
 * Data comes from the `einvoice_status_history` tool (Iopole API).
 *
 * Visual: left = date/time, center = vertical line + dots, right = status badge + destType.
 * Most recent status at top. Latest dot is larger with a pulse animation.
 */

import { type CSSProperties, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { dateLocale, t } from "~/shared/i18n";
import { BrandFooter, BrandHeader } from "~/shared/Brand";
import { EmptyTimelineIcon, FeedbackBanner } from "~/shared/Feedback";
import { getStatus } from "~/shared/status";
import { useViewerLifecycle } from "~/shared/useViewerLifecycle";
import { extractToolResultText, type ToolResultPayload, type UiRefreshRequestData } from "~/shared/refresh";
import { StatusBadge } from "~/shared/StatusBadge";

const app = new App({ name: "Status Timeline", version: "1.0.0" });
const REFRESH_THROTTLE_MS = 15_000;

// ============================================================================
// Types — Iopole status history data shape
// ============================================================================

interface StatusEntry {
  date: string; // ISO 8601
  code: string; // "DELIVERED", "PAYMENT_SENT", "REJECTED", etc.
  destType?: string; // "PLATFORM", "OPERATOR", "PPF", etc.
  message?: string; // Optional description
}

interface TimelineData {
  entries: StatusEntry[];
  refreshRequest?: UiRefreshRequestData;
}

// ============================================================================
// Date formatting — French locale
// ============================================================================

function formatDate(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: iso || "—", time: "" };
    const loc = dateLocale();
    return {
      date: d.toLocaleDateString(loc, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: iso || "—", time: "" };
  }
}

// ============================================================================
// Dest type labels
// ============================================================================

const DEST_TYPE_KEYS: Record<string, string> = {
  PLATFORM: "platform",
  OPERATOR: "operator",
  PPF: "platform",
  BUYER: "buyer",
  SELLER: "seller_label",
  TAX_AUTHORITY: "tax_authority",
};

function formatDestType(destType: string): string {
  const key = DEST_TYPE_KEYS[destType.toUpperCase()];
  return key ? t(key) : destType;
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
// Parse payload
// ============================================================================

function parseTimelinePayload(
  result: ToolResultPayload,
): import("~/shared/useViewerLifecycle").ParsePayloadResult<TimelineData> {
  const text = extractToolResultText(result);
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    let parsed: TimelineData;
    if (Array.isArray(raw)) {
      parsed = { entries: raw as StatusEntry[] };
    } else if (raw && typeof raw === "object" && "entries" in raw) {
      parsed = raw as TimelineData;
    } else if (raw && typeof raw === "object") {
      parsed = { entries: [raw as StatusEntry] };
    } else {
      return null;
    }
    // Sort most recent first
    parsed.entries.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return { data: parsed };
  } catch {
    return { error: t("error_parsing") };
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function StatusTimeline() {
  useEffect(() => {
    injectPulseKeyframes();
  }, []);

  const {
    data,
    loading,
    refreshing,
    error,
    onRefresh,
    onError,
  } = useViewerLifecycle<TimelineData>({
    app,
    minIntervalMs: REFRESH_THROTTLE_MS,
    parsePayload: parseTimelinePayload,
  });

  const entries = data?.entries ?? null;

  // ── Loading skeleton ──────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <BrandHeader />
        <div style={{ padding: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 20,
                alignItems: "center",
              }}
            >
              <div className="skeleton" style={{ width: 80, height: 14 }} />
              <div
                className="skeleton"
                style={{ width: 8, height: 8, borderRadius: "50%" }}
              />
              <div
                className="skeleton"
                style={{ width: `${30 + i * 12}%`, height: 14 }}
              />
            </div>
          ))}
        </div>
        <BrandFooter />
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────

  if (!entries || entries.length === 0) {
    return (
      <div
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <BrandHeader />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            color: colors.text.muted,
            gap: 12,
            flex: 1,
          }}
        >
          <EmptyTimelineIcon />
          <div style={{ fontSize: 13 }}>{t("no_history")}</div>
        </div>
        <BrandFooter />
      </div>
    );
  }

  // ── Timeline ──────────────────────────────────────────────────────

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <BrandHeader />
      <div style={{ padding: 16, fontFamily: fonts.sans, flex: 1 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: colors.text.primary,
            }}
          >
            {t("status_history_title")}
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={styles.button}
          >
            {refreshing ? "..." : t("refresh")}
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

        {/* Timeline entries */}
        <div style={{ position: "relative" }}>
          {entries.map((entry, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === entries.length - 1;
            const scheme = getStatus(entry.code);
            const { date, time } = formatDate(entry.date);
            const dotSize = isFirst ? 8 : 6;

            return (
              <div key={idx} style={{ display: "flex", gap: 0, minHeight: 56 }}>
                {/* Left — date + time */}
                <div
                  style={{
                    width: 90,
                    flexShrink: 0,
                    textAlign: "right",
                    paddingRight: 16,
                    paddingTop: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: colors.text.secondary,
                      lineHeight: "1.3",
                    }}
                  >
                    {date}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: colors.text.faint,
                      fontFamily: fonts.mono,
                    }}
                  >
                    {time}
                  </div>
                </div>

                {/* Center — line + dot */}
                <div
                  style={{
                    position: "relative",
                    width: 20,
                    flexShrink: 0,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  {/* Vertical line segment */}
                  {!isLast && (
                    <div
                      style={{
                        position: "absolute",
                        top: dotSize / 2 + 2,
                        bottom: 0,
                        left: "50%",
                        width: 2,
                        transform: "translateX(-50%)",
                        background: colors.border,
                      }}
                    />
                  )}
                  {/* Dot */}
                  <div
                    style={{
                      position: "relative",
                      top: 2,
                      width: dotSize,
                      height: dotSize,
                      borderRadius: "50%",
                      background: scheme.color,
                      flexShrink: 0,
                      zIndex: 1,
                      ...(isFirst
                        ? {
                          animation: "status-dot-pulse 2s ease-in-out infinite",
                          // The CSS variable drives the pulse glow color
                        }
                        : {}),
                    } as CSSProperties}
                  />
                </div>

                {/* Right — status badge + dest type */}
                <div
                  style={{
                    paddingLeft: 12,
                    paddingBottom: 20,
                    flex: 1,
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
                    <StatusBadge code={entry.code} />
                    <span style={{ fontSize: 11, color: colors.text.muted }}>
                      {formatDestType(entry.destType ?? "")}
                    </span>
                  </div>
                  {entry.message && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: colors.text.secondary,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {entry.message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <BrandFooter />
    </div>
  );
}
