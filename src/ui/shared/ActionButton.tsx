/**
 * ActionButton — shared button with optional inline confirmation.
 *
 * When `confirm` is set, clicking shows a confirmation bar with
 * "Confirmer" / "Annuler" buttons instead of executing immediately.
 * Auto-dismisses after 6 seconds.
 */

import { useEffect, useRef, useState } from "react";
import { colors, fonts, styles } from "./theme";
import { t } from "./i18n";

const VARIANT_COLORS: Record<string, { color: string; bg: string }> = {
  success: { color: colors.success, bg: colors.successDim },
  error: { color: colors.error, bg: colors.errorDim },
  info: { color: colors.info, bg: colors.infoDim },
  default: { color: colors.text.secondary, bg: colors.bg.elevated },
};

export function ActionButton(
  {
    label,
    variant = "default",
    disabled,
    loading,
    confirm,
    size = "md",
    onClick,
  }: {
    label: string;
    variant?: "success" | "error" | "info" | "default";
    disabled?: boolean;
    loading?: boolean;
    confirm?: boolean;
    size?: "sm" | "md";
    onClick: () => void;
  },
) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const vc = VARIANT_COLORS[variant] ?? VARIANT_COLORS.default;
  const isSm = size === "sm";

  function handleClick() {
    if (confirm && !confirming) {
      setConfirming(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setConfirming(false), 6000);
      return;
    }
    setConfirming(false);
    onClick();
  }

  if (confirming) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: colors.bg.elevated,
          borderRadius: 8,
          padding: "4px 6px",
          border: `1px solid ${vc.color}40`,
        }}
      >
        <span
          style={{
            fontSize: isSm ? 10 : 11,
            color: colors.text.muted,
            fontFamily: fonts.sans,
            whiteSpace: "nowrap",
          }}
        >
          {label} ?
        </span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            clearTimeout(timerRef.current);
            onClick();
          }}
          style={{
            ...styles.button,
            background: vc.bg,
            color: vc.color,
            borderColor: vc.color,
            fontSize: isSm ? 10 : 11,
            padding: isSm ? "2px 8px" : "3px 10px",
            fontWeight: 700,
          }}
        >
          {t("confirm")}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            clearTimeout(timerRef.current);
          }}
          style={{
            ...styles.button,
            background: "transparent",
            color: colors.text.faint,
            border: "none",
            fontSize: isSm ? 10 : 11,
            padding: isSm ? "2px 6px" : "3px 8px",
          }}
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      style={{
        ...styles.button,
        background: vc.bg,
        color: vc.color,
        borderColor: vc.color,
        opacity: disabled || loading ? 0.5 : 1,
        ...(isSm ? { fontSize: 11, padding: "4px 10px" } : {}),
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}
