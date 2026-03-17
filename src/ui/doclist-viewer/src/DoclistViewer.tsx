/**
 * Doclist Viewer — Generic table for E-Invoice data
 *
 * Auto-detects columns, sorting, filtering, pagination, CSV export.
 * French e-invoicing statuses (PPF lifecycle).
 */

import { useState, useEffect, useMemo, useCallback, useRef, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatNumber } from "~/shared/theme";
import { IopoleBrandHeader, IopoleBrandFooter } from "~/shared/IopoleBrand";
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
  data: Record<string, unknown>[];
  refreshRequest?: UiRefreshRequestData;
  _rowAction?: RowAction;
}

type SortDir = "asc" | "desc";

// Iopole + French e-invoicing statuses
const DOC_STATUS: Record<string, { color: string; bg: string }> = {
  deposited: { color: colors.info, bg: colors.infoDim },
  accepted: { color: colors.success, bg: colors.successDim },
  paid: { color: colors.success, bg: colors.successDim },
  received: { color: colors.info, bg: colors.infoDim },
  rejected: { color: colors.error, bg: colors.errorDim },
  refused: { color: colors.error, bg: colors.errorDim },
  disputed: { color: colors.warning, bg: colors.warningDim },
  pending: { color: colors.warning, bg: colors.warningDim },
  active: { color: colors.success, bg: colors.successDim },
  inactive: { color: colors.text.faint, bg: colors.bg.elevated },
  cancelled: { color: colors.text.faint, bg: colors.bg.elevated },
};

function StatusCell({ value }: { value: string }) {
  const scheme = DOC_STATUS[value.toLowerCase()];
  if (!scheme) return <span>{value}</span>;
  return <span style={styles.badge(scheme.color, scheme.bg)}>{value}</span>;
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
        Aucun document
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Lancez une recherche pour afficher les résultats
        </div>
      </div>
    </div>
  );
}

const STATUS_FIELDS = new Set(["status", "state", "lifecycle_status"]);
const HIDDEN_FIELDS = new Set(["doctype", "owner", "modified_by", "creation", "modified", "idx", "_rowAction"]);

function isStatusField(key: string): boolean {
  return STATUS_FIELDS.has(key.toLowerCase());
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return formatNumber(value, value % 1 === 0 ? 0 : 2);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function exportCsv(columns: string[], rows: Record<string, unknown>[], doctype?: string) {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((col) => {
      const v = formatCell(row[col]);
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  ).join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doctype ?? "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      hydrateData(JSON.parse(text) as DoclistData);
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
    }, options)) return false;

    if (!request || !app.getHostCapabilities()?.serverTools) return false;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({ name: request.toolName, arguments: request.arguments }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) { setError("Échec du rafraîchissement"); return false; }
      if (!consumeToolResult(result)) { setError("Aucune donnée"); return false; }
      return true;
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
      return false;
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
      <IopoleBrandHeader />
      <div style={{ flex: 1 }}>
        {loading ? <LoadingSkeleton /> : !data ? <DoclistEmptyState /> : (
          <DoclistContent data={data} error={error} refreshing={refreshing} onRefresh={() => void requestRefresh({ ignoreInterval: true })} />
        )}
      </div>
      <IopoleBrandFooter />
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

function DoclistContent({ data, error, refreshing, onRefresh }: { data: DoclistData; error: string | null; refreshing: boolean; onRefresh: () => void }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [drillLoading, setDrillLoading] = useState<number | null>(null);

  const rowAction = data._rowAction;
  const isClickable = !!rowAction;

  async function onRowClick(row: Record<string, unknown>, rowIndex: number) {
    if (!rowAction) return;
    const idValue = getNestedValue(row, rowAction.idField);
    if (idValue == null) return;

    setDrillLoading(rowIndex);
    try {
      await app.callServerTool(
        { name: rowAction.toolName, arguments: { [rowAction.argName]: String(idValue) } },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setDrillLoading(null);
    }
  }

  const rows = data.data ?? [];

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
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) => columns.some((col) => formatCell(row[col]).toLowerCase().includes(q)));
  }, [rows, filter, columns]);

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
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>{data.doctype ?? "Documents"}</div>
          <div style={{ fontSize: 12, color: colors.text.muted }}>{sorted.length} sur {data.count ?? rows.length} résultats</div>
          <div aria-live="polite" style={{ fontSize: 11, color: error ? colors.error : colors.text.faint, marginTop: 4 }}>
            {error ?? (refreshing ? "Rafraîchissement…" : "Rafraîchissement auto au focus")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="text" placeholder="Rechercher..." value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}
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
              {refreshing ? "…" : "Rafraîchir"}
            </span>
          </button>
          <button onClick={() => exportCsv(columns, sorted, data.doctype)} style={styles.button}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.accent; (e.currentTarget as HTMLElement).style.color = colors.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.color = colors.text.secondary; }}
          >CSV</button>
        </div>
      </div>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, columns.length * 120) }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} onClick={() => handleSort(col)} style={{ ...styles.tableHeader, background: colors.bg.surface, color: sortKey === col ? colors.accent : colors.text.muted }}>
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
                <tr><td colSpan={columns.length} style={{ ...styles.tableCell, textAlign: "center", color: colors.text.muted, padding: 32 }}>Aucun résultat</td></tr>
              ) : pageRows.map((row, idx) => {
                const globalIdx = page * PAGE_SIZE + idx;
                const isDrilling = drillLoading === globalIdx;
                return (
                <tr key={idx}
                  style={{ transition: "background 0.1s", cursor: isClickable ? "pointer" : "default", opacity: isDrilling ? 0.5 : 1 }}
                  onClick={isClickable ? () => void onRowClick(row, globalIdx) : undefined}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {columns.map((col, colIdx) => {
                    const val = row[col];
                    const isNum = typeof val === "number";
                    const isStatus = isStatusField(col) && typeof val === "string";
                    return (
                      <td key={col} style={{ ...styles.tableCell, ...(isNum ? { textAlign: "right", fontFamily: fonts.mono, fontSize: 12 } : {}), ...(col === "name" || col === "id" ? { fontWeight: 500 } : {}), maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as CSSProperties}>
                        {isDrilling && colIdx === 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span className="skeleton" style={{ width: 14, height: 14, borderRadius: "50%", display: "inline-block" }} />
                            {isStatus ? <StatusCell value={val as string} /> : formatCell(val)}
                          </span>
                        ) : (
                          isStatus ? <StatusCell value={val as string} /> : formatCell(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, color: colors.text.muted }}>Page {page + 1} / {totalPages}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["Début", 0, page === 0], ["Préc", page - 1, page === 0], ["Suiv", page + 1, page >= totalPages - 1], ["Fin", totalPages - 1, page >= totalPages - 1]].map(([label, target, disabled]) => (
              <button key={label as string} onClick={() => setPage(target as number)} disabled={disabled as boolean}
                style={{ ...styles.button, padding: "4px 10px", fontSize: 11, opacity: (disabled as boolean) ? 0.4 : 1, cursor: (disabled as boolean) ? "default" : "pointer" }}
                onMouseEnter={(e) => { if (!(disabled as boolean)) (e.currentTarget as HTMLElement).style.borderColor = colors.accent; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; }}
              >{label as string}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
