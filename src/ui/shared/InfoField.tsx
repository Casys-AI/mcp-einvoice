/**
 * InfoField — compact labeled key-value field with fallback em-dash.
 *
 * Compared to InfoCard, InfoField:
 * - Uses tighter vertical padding (6px vs 8px)
 * - Always renders the value slot (shows "—" when undefined)
 * - Supports an optional `sub` subtitle line
 * - Supports `mono` prop to render value in monospace (for identifiers/codes)
 *
 * Used by DirectoryCard and DirectoryList expanded detail panels.
 */

import { colors, fonts } from "./theme";

export function InfoField({ label, value, sub, mono }: {
  label: string;
  value?: string;
  sub?: string;
  /** Render the value in monospace font. Default: false. */
  mono?: boolean;
}) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div
        style={{
          fontSize: 10,
          color: colors.text.muted,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: colors.text.primary,
          ...(mono ? { fontFamily: fonts.mono } : {}),
        }}
      >
        {value ?? "\u2014"}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: colors.text.faint, marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
