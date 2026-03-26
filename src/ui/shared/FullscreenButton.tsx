import type { CSSProperties } from "react";
import { colors } from "./theme";
import { t } from "./i18n";

export function FullscreenButton(
  { isFullscreen, canFullscreen, onToggle, compact, style }: {
    isFullscreen: boolean;
    canFullscreen: boolean;
    onToggle: () => void;
    compact?: boolean;
    style?: CSSProperties;
  },
) {
  if (!canFullscreen) return null;

  const size = compact ? 28 : 32;
  const label = isFullscreen ? t("exit_fullscreen") : t("fullscreen");

  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        minWidth: size,
        height: size,
        padding: 0,
        background: colors.bg.elevated,
        border: "1px solid transparent",
        borderRadius: compact ? 8 : 10,
        color: colors.text.secondary,
        cursor: "pointer",
        transition: "all 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = colors.bg.hover;
        (e.currentTarget as HTMLElement).style.color = colors.accent;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = colors.bg.elevated;
        (e.currentTarget as HTMLElement).style.color = colors.text.secondary;
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        {isFullscreen
          ? (
            // Collapse: arrows pointing inward
            <path
              d="M1 5h3V2M13 9h-3v3M5 1v3H2M9 13v-3h3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
          : (
            // Expand: arrows pointing outward
            <path
              d="M1 1h3v3M13 13h-3v-3M1 13h3v-3M13 1h-3v3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
      </svg>
    </button>
  );
}
