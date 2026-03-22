/**
 * Doclist Viewer — Generic table for E-Invoice data
 *
 * Auto-detects columns, sorting, filtering, pagination, CSV export.
 * French e-invoicing statuses (PPF lifecycle).
 */

import { Fragment, useState, useEffect, useMemo, useCallback, useRef, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatNumber, formatCurrency } from "~/shared/theme";
import { t } from "~/shared/i18n";
import { BrandHeader, BrandFooter } from "~/shared/Brand";
import { FeedbackBanner } from "~/shared/Feedback";
import { STATUS_REGISTRY, getStatus, getStatusLabel, canAcceptReject, canSendPayment, canReceivePayment } from "~/shared/status";
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

const app = new App({ name: "Doclist Viewer", version: "1.0.0" });
const TOOL_CALL_TIMEOUT_MS = 10_000;
const REFRESH_THROTTLE_MS = 15_000;

interface RowAction {
  toolName: string;
  /** Dot-path to the ID field in each row (e.g. "metadata.invoiceId") */
  idField: string;
  /** Argument name to pass to the tool (e.g. "id") */
  argName: string;
}

interface DoclistData {
  count: number;
  doctype?: string;
  _title?: string;
  data: Record<string, unknown>[];
  refreshRequest?: UiRefreshRequestData;
  _rowAction?: RowAction;
}

type SortDir = "asc" | "desc";

import { MATERIAL_ICON_PATHS } from "~/shared/material-icons";

function StatusCell({ value }: { value: string }) {
  const s = getStatus(value);
  return (
    <span
      title={s.label}
      style={{
        display: "inline-block",
        width: 3,
        height: 20,
        borderRadius: 3,
        background: s.color,
        opacity: 0.85,
        cursor: "default",
      }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: i === 1 ? 32 : 20, width: i === 1 ? "40%" : `${60 + i * 8}%` }} />
        ))}
        <div style={{ marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 36, marginBottom: 2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DoclistEmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16 }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
        <rect x="8" y="8" width="40" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M8 18h40" stroke="currentColor" strokeWidth="2" />
        <path d="M20 8v40M36 8v40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <path d="M8 28h40M8 38h40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        {t("no_documents")}
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          {t("search_prompt")}
        </div>
      </div>
    </div>
  );
}

const STATUS_FIELDS = new Set(["status", "state", "statut", "lifecycle_status"]);
const DIRECTION_FIELDS = new Set(["direction", "Direction"]);
const HIDDEN_FIELDS = new Set(["doctype", "owner", "modified_by", "creation", "modified", "idx", "_rowAction"]);
const FILTERABLE_COLUMNS = new Set(["Direction", "Statut", "Type", "Scope", "Pays", "status", "direction", "type"]);

function isStatusField(key: string): boolean {
  return STATUS_FIELDS.has(key.toLowerCase());
}

function isDirectionField(key: string): boolean {
  return DIRECTION_FIELDS.has(key);
}

function DirectionCell({ value }: { value: string }) {
  const isReceived = value === "Entrante" || value === "received";
  const isSent = value === "Sortante" || value === "sent";
  const icon = isReceived ? "call_received" : isSent ? "call_made" : null;
  const label = isReceived ? t("received") : isSent ? t("sent") : value;
  const color = isReceived ? colors.info : isSent ? colors.accent : colors.text.muted;
  const path = icon ? MATERIAL_ICON_PATHS[icon] : null;
  return (
    <span title={label} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, cursor: "default" }}>
      {path ? (
        <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 -960 960 960" fill={color}><path d={path} /></svg>
      ) : (
        <span style={{ fontSize: 12, color }}>{label}</span>
      )}
    </span>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return formatNumber(value, value % 1 === 0 ? 0 : 2);
  if (typeof value === "boolean") return value ? t("yes") : t("no");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function exportCsv(columns: string[], rows: Record<string, unknown>[], doctype?: string) {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((col) => {
      const v = formatCell(row[col]);
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  ).join("\n");

  const csv = `${header}\n${body}`;
  const filename = `${doctype ?? "export"}.csv`;
  // Use MCP Apps SDK downloadFile — works in sandboxed iframes
  try {
    await app.downloadFile({
      contents: [{
        type: "resource",
        resource: {
          uri: `file:///${filename}`,
          mimeType: "text/csv",
          text: csv,
        },
      }],
    });
  } catch {
    // Fallback to blob URL for non-MCP hosts (inspector, test harness)
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function DoclistViewer() {
  const [data, setData] = useState<DoclistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<DoclistData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: DoclistData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(nextData, refreshRequestRef.current);
    setData(nextData);
    // Note: statusOverrides are cleared in DoclistContent via data dependency
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      if (!parsed) return false;
      // Detect doclist-shaped results vs drill-down results (invoice, entity).
      // Doclist results have data[], or doclist markers (_title, _rowAction, count).
      if (!Array.isArray(parsed.data)) {
        if (parsed._title || parsed._rowAction) {
          // Empty doclist (e.g. no unseen invoices) — ensure data is an array
          parsed.data = [];
        } else {
          return false; // Not a doclist — drill-down result handled by InlineDetailPanel
        }
      }
      hydrateData(parsed as DoclistData);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError(t("error_parsing"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}): Promise<void> {
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
      if (result.isError) setError(t("error_refresh"));
      else if (!consumeToolResult(result)) setError(t("no_data"));
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }} aria-busy={refreshing}>
      <BrandHeader />
      <div style={{ flex: 1 }}>
        {loading && <LoadingSkeleton />}
        {!loading && !data && <DoclistEmptyState />}
        {!loading && data && (
          <DoclistContent data={data} error={error} refreshing={refreshing} onRefresh={() => void requestRefresh({ ignoreInterval: true })} onError={setError} />
        )}
      </div>
      <BrandFooter />
    </div>
  );
}

const PAGE_SIZE = 20;

/** Resolve a dot-path like "metadata.invoiceId" on an object */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function PageButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...styles.button, padding: "4px 10px", fontSize: 11, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = colors.accent; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; }}
    >{label}</button>
  );
}

// ============================================================================
// Inline Detail Panel — expanded row with invoice/entity details + actions
// ============================================================================

function InlineDetailPanel({ data, loading, onClose, onAction }: {
  data: Record<string, unknown> | null;
  loading: boolean;
  onClose: () => void;
  onAction: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}) {
  const [actLoading, setActLoading] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actOk, setActOk] = useState(true);

  if (loading) return (
    <div style={{ padding: 16, background: colors.bg.surface }}>
      {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 14, width: `${30 + i * 15}%`, marginBottom: 8 }} />)}
    </div>
  );
  if (!data) return null;

  async function act(key: string, tool: string, args: Record<string, unknown>, msg: string) {
    setActLoading(key);
    setActMsg(null);
    const ok = await onAction(tool, args);
    setActOk(ok);
    setActMsg(ok ? msg : t("action_failed"));
    setActLoading(null);
  }

  // Detect invoice data vs generic
  const inv = data as Record<string, unknown>;
  const isInvoice = "sender_name" in inv || "invoice_number" in inv || ("id" in inv && "status" in inv && "direction" in inv);

  if (!isInvoice) {
    // Flatten nested objects for display — show primitives as cards, expand objects one level
    const flatEntries: [string, string][] = [];
    for (const [k, v] of Object.entries(inv)) {
      if (k.startsWith("_") || k === "refreshRequest") continue;
      if (v == null) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        // Expand one level: postalAddress.city → "city"
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          if (sv != null && typeof sv !== "object") flatEntries.push([`${k}.${sk}`, String(sv)]);
        }
      } else if (Array.isArray(v)) {
        flatEntries.push([k, `${v.length} ${v.length > 1 ? t("items") : t("item")}`]);
      } else {
        flatEntries.push([k, formatCell(v)]);
      }
    }
    // Extract a title from common name fields
    const title = String(inv.name ?? inv.corporateName ?? inv.label ?? t("details"));
    return (
      <div style={{ padding: 16, background: colors.bg.surface, borderTop: `2px solid ${colors.accent}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{title}</span>
          <button onClick={onClose} style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
          {flatEntries.map(([k, v]) => (
            <InfoCard key={k} label={k.replace(/_/g, " ").replace(/\./g, " › ")} value={v} />
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
    <div style={{ padding: 16, background: colors.bg.surface, borderTop: `2px solid ${colors.accent}` }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>{String(inv.invoice_number ?? inv.id)}</span>
          <span style={styles.badge(statusScheme.color, statusScheme.bg)}>{statusScheme.label}</span>
          {inv.direction && <span style={{ fontSize: 11, color: colors.text.muted }}>{isReceived ? t("received") : t("sent")}</span>}
          {inv.format && <span style={{ ...styles.badge(colors.text.secondary, colors.bg.elevated), fontSize: 10 }}>{String(inv.format).toUpperCase()}</span>}
        </div>
        <button onClick={onClose} style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}>✕</button>
      </div>

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6, marginBottom: 10 }}>
        {inv.sender_name && <InfoCard label={t("sender")} value={String(inv.sender_name)} sub={inv.sender_id ? `SIRET ${inv.sender_id}` : undefined} />}
        {inv.receiver_name && <InfoCard label={t("recipient")} value={String(inv.receiver_name)} sub={inv.receiver_id ? `SIRET ${inv.receiver_id}` : undefined} />}
        {inv.issue_date && <InfoCard label={t("issue_date_long")} value={String(inv.issue_date)} />}
        {inv.due_date && <InfoCard label={t("due_date")} value={String(inv.due_date)} />}
        {inv.total_ttc != null && <InfoCard label={t("total_ttc")} value={formatCurrency(Number(inv.total_ttc), currency)} bold />}
        {inv.total_ht != null && <InfoCard label={t("total_ht")} value={formatCurrency(Number(inv.total_ht), currency)} />}
      </div>

      {/* Action feedback */}
      {actMsg && <div style={{ fontSize: 11, color: actOk ? colors.success : colors.error, marginBottom: 8 }}>{actMsg}</div>}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
        {showAcceptReject && (
          <>
            <ActionButton size="sm" label={t("accept")} variant="success" loading={actLoading === "accept"}
              onClick={() => act("accept", "einvoice_status_send", { invoice_id: inv.id, code: "APPROVED" }, t("invoice_accepted"))} />
            <ActionButton size="sm" label={t("reject")} variant="error" confirm loading={actLoading === "reject"}
              onClick={() => act("reject", "einvoice_status_send", { invoice_id: inv.id, code: "REFUSED" }, t("invoice_refused"))} />
            <ActionButton size="sm" label={t("dispute")} variant="default" confirm loading={actLoading === "dispute"}
              onClick={() => act("dispute", "einvoice_status_send", { invoice_id: inv.id, code: "DISPUTED" }, t("dispute_filed"))} />
          </>
        )}
        {showSendPayment && (
          <ActionButton size="sm" label={t("payment_sent")} variant="success" loading={actLoading === "pay"}
            onClick={() => act("pay", "einvoice_status_send", { invoice_id: inv.id, code: "PAYMENT_SENT" }, t("payment_sent"))} />
        )}
        {showReceivePayment && (
          <ActionButton size="sm" label={t("payment_received")} variant="success" loading={actLoading === "payrcv"}
            onClick={() => act("payrcv", "einvoice_status_send", { invoice_id: inv.id, code: "PAYMENT_RECEIVED" }, t("payment_received"))} />
        )}
        {hasId && (
          <ActionButton size="sm" label={t("full_details")}
            onClick={async () => {
              try { await app.sendMessage({ role: "user", content: [{ type: "text", text: `Montre-moi les détails de la facture ${inv.id}` }] }); } catch {}
            }} />
        )}
      </div>
    </div>
  );
}

function DoclistContent({ data, error, refreshing, onRefresh, onError }: { data: DoclistData; error: string | null; refreshing: boolean; onRefresh: () => void; onError: (msg: string | null) => void }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, unknown> | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [chipFilters, setChipFilters] = useState<Record<string, string>>({});
  const actionTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const rowAction = data._rowAction;
  // Rows are clickable if there's a _rowAction OR if rows have _detail (local expand)
  const dataRows = data.data ?? [];
  const hasLocalDetail = dataRows.length > 0 && dataRows[0]._detail != null;
  const isClickable = !!rowAction || hasLocalDetail;

  async function onRowClick(row: Record<string, unknown>) {
    if (row._id == null) return;
    const idStr = String(row._id);

    // Toggle: click same row = collapse
    if (expandedId === idStr) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }

    // Local expand: use _detail data directly without calling a tool
    if (!rowAction && row._detail) {
      setExpandedId(idStr);
      setExpandedData(row._detail as Record<string, unknown>);
      return;
    }

    if (!rowAction) return;

    setExpandedId(idStr);
    setExpandedData(null);
    setExpandedLoading(true);

    try {
      const result = await app.callServerTool(
        { name: rowAction.toolName, arguments: { [rowAction.argName]: idStr } },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
      if (!result.isError) {
        const text = extractToolResultText(result);
        if (text) {
          const parsed = JSON.parse(text);
          const detail = parsed.preview ?? parsed;
          // Fallback: if detail has no status, use the row's status.
          // INBOUND invoice copies have no status history in Iopole.
          if (!detail.status) {
            const rowStatus = row["Statut"] ?? row["status"] ?? row["state"];
            if (rowStatus) detail.status = String(rowStatus);
          }
          if (!detail.direction) {
            const rawDir = row["_direction"] ?? row["Direction"];
            if (rawDir === "INBOUND" || rawDir === "Entrante") detail.direction = "received";
            else if (rawDir === "OUTBOUND" || rawDir === "Sortante") detail.direction = "sent";
          }
          setExpandedData(detail);
        }
      } else {
        onError(t("error_loading_details"));
        setExpandedId(null);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : t("error_loading"));
      setExpandedId(null);
    } finally {
      setExpandedLoading(false);
    }
  }

  async function handleDetailAction(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    try {
      const result = await app.callServerTool({ name: toolName, arguments: args }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) return false;
      // Optimistic update: if this was a status action, update the row's status locally.
      // Iopole search state (DELIVERED) never reflects lifecycle actions (APPROVED),
      // so we override it in the UI for immediate feedback.
      if (toolName === "einvoice_status_send" && expandedId && args.code) {
        setStatusOverrides(prev => ({ ...prev, [expandedId]: String(args.code) }));
      }
      // Re-fetch detail after delay (cancel previous pending refresh)
      const currentId = expandedId;
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = setTimeout(async () => {
        if (currentId && rowAction) {
          try {
            const refreshResult = await app.callServerTool(
              { name: rowAction.toolName, arguments: { [rowAction.argName]: currentId } },
              { timeout: TOOL_CALL_TIMEOUT_MS },
            );
            if (!refreshResult.isError) {
              const text = extractToolResultText(refreshResult);
              if (text) {
                const parsed = JSON.parse(text);
                setExpandedData(parsed.preview ?? parsed);
              }
            }
          } catch { /* ignore */ }
        }
      }, 2500);
      return true;
    } catch { return false; }
  }

  // Collapse when sort/filter/page changes
  useEffect(() => { setExpandedId(null); setExpandedData(null); }, [sortKey, sortDir, filter, page, chipFilters]);
  // Clear stale status overrides when list data refreshes from server
  useEffect(() => { setStatusOverrides({}); }, [data]);

  const rows = data.data ?? [];

  // Auto-detect filterable columns: columns with 2-8 distinct values
  const filterableColumns = useMemo(() => {
    if (rows.length < 2) return [];
    const candidates: { col: string; values: string[] }[] = [];
    for (const col of Object.keys(rows[0] ?? {})) {
      if (!FILTERABLE_COLUMNS.has(col)) continue;
      const distinct = new Set<string>();
      for (const row of rows) {
        const v = row[col];
        if (v != null && typeof v === "string") distinct.add(v);
        if (distinct.size > 8) break;
      }
      if (distinct.size >= 2 && distinct.size <= 8) {
        candidates.push({ col, values: Array.from(distinct).sort() });
      }
    }
    return candidates;
  }, [rows]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!HIDDEN_FIELDS.has(key) && !key.startsWith("_")) allKeys.add(key);
      }
    }
    return Array.from(allKeys).sort((a, b) => {
      if (a === "name" || a === "id") return -1;
      if (b === "name" || b === "id") return 1;
      if (isStatusField(a)) return -1;
      if (isStatusField(b)) return 1;
      return a.localeCompare(b);
    });
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    // Apply chip filters
    for (const [col, value] of Object.entries(chipFilters)) {
      if (value) result = result.filter((row) => row[col] === value);
    }
    // Apply text filter
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((row) => columns.some((col) => formatCell(row[col]).toLowerCase().includes(q)));
    }
    return result;
  }, [rows, filter, columns, chipFilters]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  return (
    <div style={{ padding: 16, fontFamily: fonts.sans }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>{data._title ?? data.doctype ?? "Documents"}</div>
          <div style={{ fontSize: 12, color: colors.text.muted }}>{sorted.length} {t("of")} {data.count ?? rows.length} {t("results")}</div>
          <div aria-live="polite" style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
            {refreshing ? t("refreshing") : t("refresh_auto")}
          </div>
          {error && <FeedbackBanner type="error" message={error} onDismiss={() => onError(null)} />}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="text" placeholder={t("search")} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            style={{ ...styles.input, maxWidth: 200 }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.accent; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.border; }}
          />
          <button onClick={onRefresh} disabled={refreshing} style={styles.button}
            onMouseEnter={(e) => { if (!refreshing) { (e.currentTarget as HTMLElement).style.borderColor = colors.accent; (e.currentTarget as HTMLElement).style.color = colors.accent; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.color = colors.text.secondary; }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M10 6a4 4 0 1 1-1.1-2.76" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 2v2.8H7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {refreshing ? "…" : t("refresh")}
            </span>
          </button>
          <button onClick={() => exportCsv(columns, sorted, data.doctype)} style={styles.button}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.accent; (e.currentTarget as HTMLElement).style.color = colors.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.color = colors.text.secondary; }}
          >CSV</button>
        </div>
      </div>

      {/* Filter chips */}
      {filterableColumns.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          {filterableColumns.map(({ col, values }) => (
            <Fragment key={col}>
              <span style={{ fontSize: 10, color: colors.text.faint, textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</span>
              <button
                onClick={() => { setChipFilters(prev => { const next = { ...prev }; delete next[col]; return next; }); setPage(0); }}
                style={{ ...styles.button, padding: "2px 8px", fontSize: 10, ...(chipFilters[col] == null ? { background: colors.accentDim, borderColor: colors.accent, color: colors.accent } : {}) }}
              >{t("all")}</button>
              {values.map(v => {
                const isActive = chipFilters[col] === v;
                const statusScheme = isStatusField(col) ? STATUS_REGISTRY[v.toLowerCase()] : null;
                return (
                  <button key={v}
                    onClick={() => { setChipFilters(prev => ({ ...prev, [col]: v })); setPage(0); }}
                    style={{
                      ...styles.button, padding: "2px 8px", fontSize: 10,
                      ...(isActive ? { background: statusScheme?.bg ?? colors.accentDim, borderColor: statusScheme?.color ?? colors.accent, color: statusScheme?.color ?? colors.accent } : {}),
                    }}
                  >{getStatusLabel(v)}</button>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      <div style={{ background: colors.bg.surface, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, columns.length * 120) }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} onClick={() => handleSort(col)} style={{ ...styles.tableHeader, background: colors.bg.elevated, color: sortKey === col ? colors.accent : colors.text.faint }}>
                    {col.replace(/_/g, " ")}
                    <span style={{ marginLeft: 4, opacity: sortKey === col ? 1 : 0.3, fontSize: 10 }}>
                      {sortKey === col ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u21C5"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ ...styles.tableCell, textAlign: "center", color: colors.text.muted, padding: 32 }}>{t("no_results")}</td></tr>
              ) : pageRows.map((row, idx) => {
                const rowId = rowAction ? String(getNestedValue(row, rowAction.idField) ?? "") : String(row._id ?? "");
                const isExpanded = expandedId === rowId && rowId !== "";
                return (
                <Fragment key={idx}>
                <tr
                  style={{
                    transition: "background 0.1s",
                    cursor: isClickable ? "pointer" : "default",
                    background: isExpanded ? colors.bg.hover : idx % 2 === 1 ? colors.bg.surface : undefined,
                  }}
                  onClick={isClickable ? () => void onRowClick(row) : undefined}
                  onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                  onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = idx % 2 === 1 ? colors.bg.surface : "transparent"; }}
                >
                  {columns.map((col, colIdx) => {
                    const val = row[col];
                    const isNum = typeof val === "number";
                    const isStatus = isStatusField(col) && typeof val === "string";
                    const isDirection = isDirectionField(col) && typeof val === "string";
                    return (
                      <td key={col} style={{ ...styles.tableCell, ...(isNum ? { textAlign: "right", fontFamily: fonts.mono, fontSize: 11, fontWeight: 600 } : {}), ...(col === "name" || col === "id" ? { fontWeight: 500 } : {}), maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as CSSProperties}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {isClickable && colIdx === 0 && (
                            <span style={{ fontSize: 10, color: colors.text.faint, transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", flexShrink: 0 }}>▶</span>
                          )}
                          {expandedLoading && isExpanded && colIdx === 0 && (
                            <span className="skeleton" style={{ width: 12, height: 12, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                          )}
                          {isStatus ? <StatusCell value={statusOverrides[rowId] ?? val as string} /> : isDirection ? <DirectionCell value={val as string} /> : formatCell(val)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: 0, borderBottom: `1px solid ${colors.border}` }}>
                      <InlineDetailPanel
                        data={expandedData}
                        loading={expandedLoading}
                        onClose={() => { setExpandedId(null); setExpandedData(null); }}
                        onAction={handleDetailAction}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, color: colors.text.muted }}>{t("page")} {page + 1} / {totalPages}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <PageButton label={t("first")} onClick={() => setPage(0)} disabled={page === 0} />
            <PageButton label={t("prev")} onClick={() => setPage(page - 1)} disabled={page === 0} />
            <PageButton label={t("next")} onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} />
            <PageButton label={t("last")} onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} />
          </div>
        </div>
      )}
    </div>
  );
}
