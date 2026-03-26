/**
 * PageShell — shared outer wrapper for MCP App viewers.
 *
 * Provides: BrandHeader + flex column full-height + BrandFooter.
 * Loading/empty logic stays in each viewer (shapes differ per viewer).
 */

import type { CSSProperties, ReactNode } from "react";
import { BrandFooter, BrandHeader } from "./Brand";

export function PageShell(
  { children, refreshing, style }: {
    children: ReactNode;
    refreshing?: boolean;
    /** Optional override styles for the inner content container. */
    style?: CSSProperties;
  },
) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      aria-busy={refreshing}
    >
      <BrandHeader />
      <div style={{ flex: 1, ...style }}>
        {children}
      </div>
      <BrandFooter />
    </div>
  );
}
