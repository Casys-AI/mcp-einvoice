/**
 * useDisplayMode — track and toggle MCP App display mode (inline ↔ fullscreen).
 *
 * Uses app.getHostContext() for initial state and app.onhostcontextchanged
 * for reactive updates (e.g. user presses Escape to exit fullscreen).
 *
 * IMPORTANT: app.onhostcontextchanged is a singleton setter on the App instance.
 * Only one handler can be active. useViewerLifecycle does NOT use it (verified),
 * so there is no conflict today. If a future hook also needs onhostcontextchanged,
 * consolidate both handlers into one.
 */

import { useEffect, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";

type DisplayMode = "inline" | "fullscreen" | "pip";

export function useDisplayMode(app: App): {
  isFullscreen: boolean;
  canFullscreen: boolean;
  toggleFullscreen: () => void;
} {
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    () => (app.getHostContext()?.displayMode as DisplayMode) ?? "inline",
  );
  const [availableModes, setAvailableModes] = useState<DisplayMode[]>(
    () =>
      (app.getHostContext()?.availableDisplayModes as DisplayMode[]) ?? [],
  );

  useEffect(() => {
    app.onhostcontextchanged = (ctx: Record<string, unknown>) => {
      if (ctx.displayMode !== undefined) {
        setDisplayMode(ctx.displayMode as DisplayMode);
      }
      if (ctx.availableDisplayModes !== undefined) {
        setAvailableModes(ctx.availableDisplayModes as DisplayMode[]);
      }
    };
    // Re-seed after connect resolves (handles hosts that send context
    // only in the initialize result, not via a subsequent notification)
    const ctx = app.getHostContext();
    if (ctx?.displayMode) setDisplayMode(ctx.displayMode as DisplayMode);
    if (ctx?.availableDisplayModes) {
      setAvailableModes(ctx.availableDisplayModes as DisplayMode[]);
    }
  }, []);

  const canFullscreen = availableModes.includes("fullscreen");
  const isFullscreen = displayMode === "fullscreen";

  function toggleFullscreen() {
    if (!canFullscreen) return;
    const target: DisplayMode = isFullscreen ? "inline" : "fullscreen";
    // Optimistic update — onhostcontextchanged will confirm or correct
    setDisplayMode(target);
    void app.requestDisplayMode({ mode: target });
  }

  return { isFullscreen, canFullscreen, toggleFullscreen };
}
