import { colors, styles } from "~/shared/theme";

export function PageButton(
  { label, onClick, disabled }: {
    label: string;
    onClick: () => void;
    disabled: boolean;
  },
) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.button,
        padding: "4px 10px",
        fontSize: 11,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = colors.accent;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = colors.border;
      }}
    >
      {label}
    </button>
  );
}
