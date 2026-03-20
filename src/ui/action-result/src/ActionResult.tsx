/**
 * Action Result — E-Invoice
 *
 * Generic confirmation viewer for mutation tools (create, delete, enroll,
 * register, configure). Shows success/error status, action details, and
 * an optional "next step" button.
 *
 * Used by all tools that perform state changes (not data retrieval).
 */

import { useState, useEffect, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { t } from "~/shared/i18n";
import { BrandHeader, BrandFooter } from "~/shared/Brand";
import {
  extractToolResultText,
  type ToolResultPayload,
} from "~/shared/refresh";

const app = new App({ name: "Action Result", version: "1.0.0" });

interface ActionResultData {
  action?: string;
  status?: "success" | "error";
  title?: string;
  message?: string;
  details?: Record<string, unknown>;
  nextAction?: {
    label: string;
    toolName: string;
    arguments?: Record<string, unknown>;
  };
}

function getStatusIcons() {
  return {
    success: { symbol: "\u2713", color: colors.success, bg: colors.successDim, label: t("success") },
    error: { symbol: "\u2717", color: colors.error, bg: colors.errorDim, label: t("error") },
  };
}

export function ActionResult() {
  const [data, setData] = useState<ActionResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [navLoading, setNavLoading] = useState(false);
  const dataRef = useRef<ActionResultData | null>(null);

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      const isAlreadyShaped = parsed.action || parsed.status || parsed.title;
      const next: ActionResultData = isAlreadyShaped
        ? parsed
        : { status: "success", title: t("operation_ok"), details: parsed };
      dataRef.current = next;
      setData(next);
      setLoading(false);
      return true;
    } catch {
      setLoading(false);
      return false;
    }
  }

  useEffect(() => {
    app.ontoolresult = (result: ToolResultPayload) => { consumeToolResult(result); };
    app.ontoolinputpartial = () => { if (!dataRef.current) setLoading(true); };
    app.connect().catch(() => {});
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <BrandHeader />
        <div style={{ padding: 24 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: i === 1 ? 32 : 16, width: `${30 + i * 15}%`, marginBottom: 8 }} />)}
        </div>
        <BrandFooter />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <BrandHeader />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 12, flex: 1 }}>
          <div style={{ fontSize: 13 }}>{t("no_results")}</div>
        </div>
        <BrandFooter />
      </div>
    );
  }

  const statusInfo = getStatusIcons()[data.status ?? "success"];
  const details = data.details ?? {};
  const detailEntries = Object.entries(details).filter(([k]) => !k.startsWith("_"));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <BrandHeader />
      <div style={{ padding: 16, fontFamily: fonts.sans, flex: 1 }}>

        {/* Status icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: statusInfo.bg, color: statusInfo.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 700,
          }}>
            {statusInfo.symbol}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>
              {data.title ?? statusInfo.label}
            </div>
            {data.action && (
              <div style={{ fontSize: 12, color: colors.text.muted }}>{data.action}</div>
            )}
          </div>
        </div>

        {/* Message */}
        {data.message && (
          <div style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 16, lineHeight: 1.5 }}>
            {data.message}
          </div>
        )}

        {/* Details grid */}
        {detailEntries.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            {detailEntries.map(([key, value]) => (
              <div key={key} style={styles.card}>
                <div style={{ fontSize: 11, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {key}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, wordBreak: "break-all" }}>
                  {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Next action button */}
        {data.nextAction && app.getHostCapabilities()?.serverTools && (
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
            <button
              onClick={async () => {
                setNavLoading(true);
                try {
                  await app.callServerTool({
                    name: data.nextAction!.toolName,
                    arguments: data.nextAction!.arguments ?? {},
                  }, { timeout: 10_000 });
                } catch { /* host handles */ }
                setNavLoading(false);
              }}
              disabled={navLoading}
              style={{
                ...styles.button,
                background: colors.accentDim,
                color: colors.accent,
                borderColor: colors.accent,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                opacity: navLoading ? 0.5 : 1,
                cursor: navLoading ? "default" : "pointer",
              }}
            >
              {navLoading ? "…" : data.nextAction.label}
            </button>
          </div>
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
