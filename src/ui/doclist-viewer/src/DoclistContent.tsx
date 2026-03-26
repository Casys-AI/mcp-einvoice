import {
  type CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { t } from "~/shared/i18n";
import { FeedbackBanner } from "~/shared/Feedback";
import { STATUS_REGISTRY, getStatusLabel } from "~/shared/status";
import { extractToolResultText } from "~/shared/refresh";
import { useCompactMode } from "~/shared/useCompactMode";
import { hoverRowHandlers } from "~/shared/useHoverRow";
import type { DoclistData, SortDir } from "./types";
import {
  FILTERABLE_COLUMNS,
  HIDDEN_FIELDS,
  classifyColumns,
  colWidth,
  isDirectionField,
  isStatusField,
} from "./columnUtils";
import { formatCell } from "./formatCell";
import { CompactRow } from "./CompactRow";
import { StatusCell } from "./StatusCell";
import { DirectionCell } from "./DirectionCell";
import { PageButton } from "./PageButton";
import { InlineDetailPanel } from "./InlineDetailPanel";

const PAGE_SIZE = 20;
const TOOL_CALL_TIMEOUT_MS = 10_000;

/** Resolve a dot-path like "metadata.invoiceId" on an object */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function DoclistContent(
  { data, error, refreshing, onRefresh, onError, onExport, app }: {
    data: DoclistData;
    error: string | null;
    refreshing: boolean;
    onRefresh: () => void;
    onError: (msg: string | null) => void;
    onExport: (columns: string[], rows: Record<string, unknown>[]) => void;
    app: App;
  },
) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<
    Record<string, unknown> | null
  >(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, string>
  >({});
  const [chipFilters, setChipFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [compact, compactRef] = useCompactMode();

  // Cleanup pending action timer on unmount
  useEffect(() => () => clearTimeout(actionTimerRef.current), []);

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
            if (
              rawDir === "received" || rawDir === "INBOUND" ||
              rawDir === "Entrante"
            ) {
              detail.direction = "received";
            } else if (
              rawDir === "sent" || rawDir === "OUTBOUND" ||
              rawDir === "Sortante"
            ) {
              detail.direction = "sent";
            }
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

  async function handleDetailAction(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) return false;
      // Optimistic update: if this was a status action, update the row's status locally.
      // Iopole search state (DELIVERED) never reflects lifecycle actions (APPROVED),
      // so we override it in the UI for immediate feedback.
      if (toolName === "einvoice_status_send" && expandedId && args.code) {
        setStatusOverrides((prev) => ({
          ...prev,
          [expandedId]: String(args.code),
        }));
      }
      // Re-fetch detail after delay (cancel previous pending refresh)
      const currentId = expandedId;
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = setTimeout(async () => {
        if (currentId && rowAction) {
          try {
            const refreshResult = await app.callServerTool(
              {
                name: rowAction.toolName,
                arguments: { [rowAction.argName]: currentId },
              },
              { timeout: TOOL_CALL_TIMEOUT_MS },
            );
            if (!refreshResult.isError) {
              const text = extractToolResultText(refreshResult);
              if (text) {
                const parsed = JSON.parse(text);
                setExpandedData(parsed.preview ?? parsed);
              }
            }
          } catch (err) {
            onError(err instanceof Error ? err.message : t("error_loading_details"));
          }
        }
      }, 2500);
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : t("action_failed"));
      return false;
    }
  }

  // Collapse when sort/filter/page changes
  useEffect(() => {
    setExpandedId(null);
    setExpandedData(null);
  }, [sortKey, sortDir, filter, page, chipFilters]);
  // Clear stale status overrides when list data refreshes from server
  useEffect(() => {
    setStatusOverrides({});
  }, [data]);

  const rows = data.data ?? [];

  // Auto-detect filterable columns: columns with 2-8 distinct values
  // Chips are derived from data filtered by OTHER active chips (direction narrows status automatically)
  const filterableColumns = useMemo(() => {
    if (rows.length < 2) return [];
    const candidates: { col: string; values: string[] }[] = [];
    for (const col of Object.keys(rows[0] ?? {})) {
      if (!FILTERABLE_COLUMNS.has(col)) continue;
      // Filter rows by all active chips EXCEPT this column
      let subset = rows;
      for (const [filterCol, filterVal] of Object.entries(chipFilters)) {
        if (filterVal && filterCol !== col) {
          subset = subset.filter((row) => row[filterCol] === filterVal);
        }
      }
      const distinct = new Set<string>();
      for (const row of subset) {
        const v = row[col];
        if (v != null && typeof v === "string") distinct.add(v);
        if (distinct.size > 8) break;
      }
      if (distinct.size >= 2 && distinct.size <= 8) {
        candidates.push({ col, values: Array.from(distinct).sort() });
      }
    }
    return candidates;
  }, [rows, chipFilters]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    // Preserve insertion order from tool response (first row defines column order)
    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!HIDDEN_FIELDS.has(key) && !key.startsWith("_")) allKeys.add(key);
      }
    }
    return Array.from(allKeys);
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
      result = result.filter((row) =>
        columns.some((col) => formatCell(row[col]).toLowerCase().includes(q))
      );
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
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const title = data._title ?? data.doctype ?? "Documents";
  const secondaryButtonStyle: CSSProperties = {
    ...styles.button,
    background: colors.bg.elevated,
    border: "1px solid transparent",
    borderRadius: 10,
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "0 12px",
    height: 32,
  };

  const cls = useMemo(() => classifyColumns(columns), [columns]);

  const handleNavigate = useCallback(async (invoiceId: string) => {
    try {
      await app.sendMessage({
        role: "user",
        content: [{
          type: "text",
          text: `${t("nav_invoice_detail")} ${invoiceId}`,
        }],
      });
    } catch { /* sendMessage is best-effort — not all hosts support it */ }
  }, [app]);

  return (
    <div ref={compactRef} style={{ padding: 16, fontFamily: fonts.sans }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: compact ? 8 : 12,
          marginBottom: compact ? 8 : 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: compact ? "center" : "flex-start",
            gap: compact ? 8 : 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {compact
              ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: colors.text.primary,
                    }}
                  >
                    {title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: colors.text.muted,
                    }}
                  >
                    {sorted.length}/{data.count ?? rows.length}
                  </span>
                </div>
              )
              : (
                <>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: colors.text.primary,
                      lineHeight: 1.2,
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: colors.text.muted,
                      marginTop: 4,
                    }}
                  >
                    {sorted.length} {t("of")} {data.count ?? rows.length}{" "}
                    {t("results")}
                  </div>
                  <div
                    aria-live="polite"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: colors.text.faint,
                      opacity: 0.55,
                      marginTop: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.18em",
                    }}
                  >
                    {refreshing ? t("refreshing") : t("refresh_auto")}
                  </div>
                </>
              )}
          </div>
          <div
            style={{
              display: "flex",
              gap: compact ? 6 : 8,
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title={t("refresh")}
              aria-label={t("refresh")}
              style={{
                ...secondaryButtonStyle,
                width: compact ? 28 : 32,
                minWidth: compact ? 28 : 32,
                height: compact ? 28 : 32,
                padding: 0,
                justifyContent: "center",
                opacity: refreshing ? 0.65 : 1,
              }}
              onMouseEnter={(e) => {
                if (!refreshing) {
                  (e.currentTarget as HTMLElement).style.background =
                    colors.bg.hover;
                  (e.currentTarget as HTMLElement).style.color = colors.accent;
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  colors.bg.elevated;
                (e.currentTarget as HTMLElement).style.color =
                  colors.text.secondary;
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M10 6a4 4 0 1 1-1.1-2.76"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <path
                  d="M10 2v2.8H7.2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {!compact && (
              <button
                onClick={() => onExport(columns, sorted)}
                aria-label="Export CSV"
                style={secondaryButtonStyle}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    colors.bg.hover;
                  (e.currentTarget as HTMLElement).style.color = colors.accent;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    colors.bg.elevated;
                  (e.currentTarget as HTMLElement).style.color =
                    colors.text.secondary;
                }}
              >
                CSV
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: "50%",
                left: compact ? 10 : 14,
                transform: "translateY(-50%)",
                color: colors.text.faint,
                opacity: 0.6,
                pointerEvents: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <svg
                width={compact ? 13 : 15}
                height={compact ? 13 : 15}
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M14.1667 14.1667L17.5 17.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle
                  cx="8.75"
                  cy="8.75"
                  r="5.41667"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder={t("search")}
              aria-label={t("search")}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              style={{
                ...styles.input,
                width: "100%",
                maxWidth: "100%",
                background: colors.bg.elevated,
                border: "1px solid transparent",
                borderRadius: compact ? 8 : 12,
                padding: compact
                  ? "7px 10px 7px 30px"
                  : "10px 14px 10px 40px",
                fontSize: compact ? 12 : 13,
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor =
                  colors.accent;
                (e.target as HTMLInputElement).style.boxShadow =
                  `0 0 0 1px ${colors.accentDim}`;
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor =
                  "transparent";
                (e.target as HTMLInputElement).style.boxShadow = "none";
              }}
            />
          </div>
          {compact && filterableColumns.length > 0 && (
            <button
              onClick={() => setShowFilters((p) => !p)}
              aria-label="Filtres"
              style={{
                ...secondaryButtonStyle,
                width: 28,
                minWidth: 28,
                height: 28,
                padding: 0,
                justifyContent: "center",
                borderRadius: 8,
                background: showFilters
                  ? colors.accentDim
                  : colors.bg.elevated,
                color: showFilters ? colors.accent : colors.text.secondary,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 4h12M4 8h8M6 12h4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        {error && (
          <FeedbackBanner
            type="error"
            message={error}
            onDismiss={() => onError(null)}
          />
        )}

        {filterableColumns.length > 0 && (!compact || showFilters) && (
          <div
            style={{
              display: "flex",
              gap: compact ? 6 : 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {filterableColumns.map(({ col, values }) => (
              <Fragment key={col}>
                {!compact && (
                  <span
                    style={{
                      fontSize: 10,
                      color: colors.text.faint,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                    }}
                  >
                    {col}
                  </span>
                )}
                {values.map((v) => {
                  const isActive = chipFilters[col] === v;
                  const statusScheme = isStatusField(col)
                    ? STATUS_REGISTRY[v.toLowerCase()]
                    : null;
                  const isDirChip = isDirectionField(col);
                  const isRecv = v === "received" || v === "Entrante";
                  const isSnt = v === "sent" || v === "Sortante";

                  let dirChipTitle: string | undefined;
                  if (compact && isDirChip) {
                    if (isRecv) dirChipTitle = t("received");
                    else if (isSnt) dirChipTitle = t("sent");
                    else dirChipTitle = v;
                  }

                  return (
                    <button
                      key={v}
                      onClick={() => {
                        setChipFilters((prev) => {
                          if (prev[col] === v) {
                            const next = { ...prev };
                            delete next[col];
                            return next;
                          }
                          return { ...prev, [col]: v };
                        });
                        setPage(0);
                      }}
                      title={dirChipTitle}
                      style={{
                        ...styles.button,
                        padding: compact ? "3px 8px" : "4px 10px",
                        fontSize: compact ? 9 : 10,
                        borderRadius: compact ? 6 : 8,
                        border: "1px solid transparent",
                        background: isActive
                          ? statusScheme?.bg ?? colors.accentDim
                          : colors.bg.elevated,
                        color: isActive
                          ? statusScheme?.color ?? colors.accent
                          : colors.text.secondary,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {compact && isDirChip
                        ? (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 14 14"
                            fill="none"
                          >
                            <path
                              d={isRecv
                                ? "M7 2v10M7 12l-3-3M7 12l3-3"
                                : "M7 12V2M7 2L4 5M7 2l3 3"}
                              stroke={!isActive
                                ? "currentColor"
                                : isRecv
                                ? "#60a5fa"
                                : "#fb923c"}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )
                        : getStatusLabel(v)}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: colors.bg.surface,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {compact
          ? (
            /* ── Compact card layout (mobile) ─────────────────── */
            <div>
              {pageRows.length === 0
                ? (
                  <div
                    style={{
                      textAlign: "center",
                      color: colors.text.muted,
                      padding: 32,
                    }}
                  >
                    {t("no_results")}
                  </div>
                )
                : pageRows.map((row, idx) => {
                  const rowId = rowAction
                    ? String(getNestedValue(row, rowAction.idField) ?? "")
                    : String(row._id ?? "");
                  const isExpanded = expandedId === rowId && rowId !== "";
                  return (
                    <Fragment key={idx}>
                      <CompactRow
                        row={row}
                        cls={cls}
                        idx={idx}
                        isExpanded={isExpanded}
                        isClickable={isClickable}
                        onClick={() => void onRowClick(row)}
                        statusOverride={statusOverrides[rowId]}
                      />
                      {isExpanded && (
                        <div
                          style={{
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                        >
                          <InlineDetailPanel
                            data={expandedData}
                            loading={expandedLoading}
                            onClose={() => {
                              setExpandedId(null);
                              setExpandedData(null);
                            }}
                            onAction={handleDetailAction}
                            onNavigate={handleNavigate}
                          />
                        </div>
                      )}
                    </Fragment>
                  );
                })}
            </div>
          )
          : (
            /* ── Table layout (desktop) ───────────────────────── */
            <div style={styles.tableScrollViewport}>
              <table
                style={{
                  width: "max-content",
                  minWidth: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  tableLayout: "auto",
                }}
              >
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        aria-sort={sortKey === col
                          ? (sortDir === "asc" ? "ascending" : "descending")
                          : "none"}
                        style={{
                          ...styles.tableHeader,
                          ...colWidth(col),
                          background: colors.bg.elevated,
                          color: sortKey === col
                            ? colors.accent
                            : colors.text.faint,
                          padding: "9px 12px",
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          borderBottom: "none",
                        }}
                      >
                        {col.replace(/_/g, " ")}
                        <span
                          style={{
                            marginLeft: 4,
                            opacity: sortKey === col ? 1 : 0.3,
                            fontSize: 10,
                          }}
                        >
                          {sortKey === col
                            ? (sortDir === "asc" ? "\u25B2" : "\u25BC")
                            : "\u21C5"}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ background: colors.bg.root }}>
                  {pageRows.length === 0
                    ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          style={{
                            ...styles.tableCell,
                            textAlign: "center",
                            color: colors.text.muted,
                            padding: 32,
                            background: colors.bg.root,
                          }}
                        >
                          {t("no_results")}
                        </td>
                      </tr>
                    )
                    : pageRows.map((row, idx) => {
                      const rowId = rowAction
                        ? String(
                          getNestedValue(row, rowAction.idField) ?? "",
                        )
                        : String(row._id ?? "");
                      const isExpanded = expandedId === rowId && rowId !== "";
                      return (
                        <Fragment key={idx}>
                          <tr
                            style={{
                              transition: "background 0.15s",
                              cursor: isClickable ? "pointer" : "default",
                              background: isExpanded
                                ? colors.bg.hover
                                : idx % 2 === 1
                                ? colors.bg.surface
                                : colors.bg.root,
                            }}
                            onClick={isClickable
                              ? () => void onRowClick(row)
                              : undefined}
                            {...hoverRowHandlers(
                              idx % 2 === 1
                                ? colors.bg.surface
                                : colors.bg.root,
                              isExpanded,
                            )}
                          >
                            {columns.map((col, colIdx) => {
                              const val = row[col];
                              const isNum = typeof val === "number";
                              const isStatus = isStatusField(col) &&
                                typeof val === "string";
                              const isDirection = isDirectionField(col) &&
                                typeof val === "string";
                              const cellValue = isStatus
                                ? (
                                  <StatusCell
                                    value={statusOverrides[rowId] ??
                                      val as string}
                                  />
                                )
                                : isDirection
                                ? <DirectionCell value={val as string} />
                                : formatCell(val);

                              let cellFontWeight = 400;
                              if (isNum) cellFontWeight = 700;
                              else if (col === "name" || col === "id") cellFontWeight = 500;

                              return (
                                <td
                                  key={col}
                                  style={{
                                    ...styles.tableCell,
                                    ...colWidth(col),
                                    padding: "11px 12px",
                                    textAlign: isNum
                                      ? "right"
                                      : isStatus || isDirection
                                      ? "center"
                                      : "left",
                                    fontFamily: isNum
                                      ? fonts.mono
                                      : fonts.sans,
                                    fontSize: isNum ? 11 : 12,
                                    fontWeight: cellFontWeight,
                                    color: isNum
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                    maxWidth: colWidth(col).maxWidth ?? 250,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    background: "transparent",
                                  } as CSSProperties}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: isNum
                                        ? "flex-end"
                                        : isStatus || isDirection
                                        ? "center"
                                        : "flex-start",
                                      gap: 6,
                                      minWidth: 0,
                                    }}
                                  >
                                    {expandedLoading && isExpanded &&
                                      colIdx === 0 && (
                                      <span
                                        className="skeleton"
                                        style={{
                                          width: 12,
                                          height: 12,
                                          borderRadius: "50%",
                                          display: "inline-block",
                                          flexShrink: 0,
                                        }}
                                      />
                                    )}
                                    {typeof cellValue === "string"
                                      ? (
                                        <span
                                          title={cellValue}
                                          style={{
                                            display: "block",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            width: "100%",
                                            minWidth: 0,
                                          }}
                                        >
                                          {cellValue}
                                        </span>
                                      )
                                      : cellValue}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td
                                colSpan={columns.length}
                                style={{
                                  padding: 0,
                                  borderBottom: `1px solid ${colors.border}`,
                                }}
                              >
                                <InlineDetailPanel
                                  data={expandedData}
                                  loading={expandedLoading}
                                  onClose={() => {
                                    setExpandedId(null);
                                    setExpandedData(null);
                                  }}
                                  onAction={handleDetailAction}
                                  onNavigate={handleNavigate}
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
          )}
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: colors.text.muted }}>
            {t("page")} {page + 1} / {totalPages}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <PageButton
              label={t("first")}
              onClick={() => setPage(0)}
              disabled={page === 0}
            />
            <PageButton
              label={t("prev")}
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            />
            <PageButton
              label={t("next")}
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            />
            <PageButton
              label={t("last")}
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
            />
          </div>
        </div>
      )}
    </div>
  );
}
