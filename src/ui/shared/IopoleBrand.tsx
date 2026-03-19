/**
 * E-Invoice Brand Components
 *
 * Header bar and footer watermark for E-Invoice MCP Apps viewers.
 * Casys design: surface background + accent text.
 * Light: purple text on light surface. Dark: warm orange text on dark surface.
 */

import { CSSProperties } from "react";
import { colors, fonts } from "./theme";

function EInvoiceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IopoleBrandHeader() {
  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px",
    height: 30,
    background: colors.bg.surface,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  };

  const wordmarkStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.accent,
  };

  const dotStyle: CSSProperties = {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: colors.text.faint,
    marginLeft: 2,
    marginRight: 2,
    flexShrink: 0,
  };

  const taglineStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.text.muted,
    letterSpacing: "0.03em",
  };

  return (
    <div style={headerStyle}>
      <div style={{ color: colors.accent }}>
        <EInvoiceIcon />
      </div>
      <span style={wordmarkStyle}>E-Invoice</span>
      <div style={dotStyle} />
      <span style={taglineStyle}>facturation électronique</span>
    </div>
  );
}

export function IopoleBrandFooter() {
  const footerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "6px 16px 8px",
    borderTop: `1px solid ${colors.borderSubtle}`,
    marginTop: 8,
  };

  const textStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.text.faint,
    letterSpacing: "0.04em",
  };

  return (
    <div style={footerStyle}>
      <span style={textStyle}>Casys AI</span>
    </div>
  );
}
