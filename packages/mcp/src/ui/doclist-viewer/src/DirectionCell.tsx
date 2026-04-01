import { colors } from "~/shared/theme";
import { t } from "~/shared/i18n";

interface DirectionArrowProps {
  isReceived: boolean;
  isSent: boolean;
  color: string;
  size?: number;
}

export function DirectionArrow(
  { isReceived, isSent, color, size = 14 }: DirectionArrowProps,
) {
  if (isReceived) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <path
          d="M7 2v10M7 12l-3-3M7 12l3-3"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (isSent) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <path
          d="M7 12V2M7 2L4 5M7 2l3 3"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return <span style={{ fontSize: 11, color }}>—</span>;
}

export function DirectionCell({ value }: { value: string }) {
  const isReceived = value === "Entrante" || value === "received";
  const isSent = value === "Sortante" || value === "sent";
  const label = isReceived ? t("received") : isSent ? t("sent") : value;
  const color = isReceived ? "#60a5fa" : isSent ? "#fb923c" : colors.text.muted;
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        cursor: "default",
      }}
    >
      <DirectionArrow isReceived={isReceived} isSent={isSent} color={color} />
    </span>
  );
}
