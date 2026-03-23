/**
 * InfoCard — labeled key-value display.
 *
 * Clean text hierarchy: small muted label + value. No card/box styling.
 * Used by InvoiceViewer, DoclistViewer InlineDetailPanel, and DirectoryCard.
 */

import { colors, fonts } from "./theme";

export function InfoCard({ label, value, sub, bold }: {
  label: string;
  value?: string;
  sub?: string;
  bold?: boolean;
}) {
  return (
    <div style={{ padding: "8px 0" }}>
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
      {value && (
        <div
          style={{
            fontSize: bold ? 15 : 13,
            fontWeight: bold ? 600 : 500,
            color: colors.text.primary,
            fontFamily: bold ? fonts.mono : fonts.sans,
          }}
        >
          {value}
        </div>
      )}
      {sub && (
        <div style={{ fontSize: 10, color: colors.text.faint, marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
