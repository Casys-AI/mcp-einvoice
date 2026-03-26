import { colors, fonts, formatCurrency } from "~/shared/theme";
import { getStatus } from "~/shared/status";
import { hoverRowHandlers } from "~/shared/useHoverRow";
import type { ClassifiedColumns } from "./columnUtils";
import { formatCell } from "./formatCell";
import { DirectionArrow } from "./DirectionCell";

export function CompactRow(
  { row, cls, idx, isExpanded, isClickable, onClick, statusOverride }: {
    row: Record<string, unknown>;
    cls: ClassifiedColumns;
    idx: number;
    isExpanded: boolean;
    isClickable: boolean;
    onClick: () => void;
    statusOverride?: string;
  },
) {
  const dirVal = cls.direction ? String(row[cls.direction] ?? "") : "";
  const isReceived = dirVal === "Entrante" || dirVal === "received";
  const isSent = dirVal === "Sortante" || dirVal === "sent";
  const dirColor = isReceived
    ? "#60a5fa"
    : isSent
    ? "#fb923c"
    : colors.text.muted;
  const sign = isReceived ? "+" : isSent ? "\u2212" : "";

  const nameVal = cls.name ? formatCell(row[cls.name]) : "";
  const idVal = cls.id ? formatCell(row[cls.id]) : "";
  const dateVal = cls.dates.length > 0 ? formatCell(row[cls.dates[0]]) : "";

  const rawAmount = cls.amount ? row[cls.amount] : null;
  const amountStr = rawAmount != null
    ? (typeof rawAmount === "number"
      ? formatCurrency(rawAmount)
      : String(rawAmount))
    : "";

  const statusVal = cls.status
    ? statusOverride ?? String(row[cls.status] ?? "")
    : "";
  const status = statusVal ? getStatus(statusVal) : null;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        cursor: isClickable ? "pointer" : "default",
        background: isExpanded
          ? colors.bg.hover
          : idx % 2 === 1
          ? colors.bg.surface
          : colors.bg.root,
        transition: "background 0.15s",
      }}
      {...(isClickable
        ? hoverRowHandlers(
          idx % 2 === 1 ? colors.bg.surface : colors.bg.root,
          isExpanded,
        )
        : {})}
    >
      {/* Direction arrow — spans both lines */}
      {cls.direction && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            flexShrink: 0,
            alignSelf: "stretch",
          }}
        >
          <DirectionArrow
            isReceived={isReceived}
            isSent={isSent}
            color={dirColor}
          />
        </div>
      )}

      {/* Center: name + id/date stacked */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: colors.text.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {nameVal || idVal || "—"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: colors.text.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "flex",
            gap: 8,
          }}
        >
          {idVal && nameVal && (
            <span style={{ fontFamily: fonts.mono, fontSize: 10 }}>
              {idVal}
            </span>
          )}
          {dateVal && <span>{dateVal}</span>}
        </div>
      </div>

      {/* Right: signed amount */}
      {amountStr && (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: 700,
            color: dirColor,
            whiteSpace: "nowrap",
            flexShrink: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {sign}{amountStr}
        </div>
      )}

      {/* Far right: status bar */}
      {status && (
        <div
          style={{
            width: 3,
            height: 24,
            borderRadius: 3,
            background: status.color,
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
}
