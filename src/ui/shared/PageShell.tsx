import type { CSSProperties, ReactNode } from "react";
import { BrandFooter, BrandHeader } from "./Brand";

export function PageShell(
  { children, refreshing, style }: {
    children: ReactNode;
    refreshing?: boolean;
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
