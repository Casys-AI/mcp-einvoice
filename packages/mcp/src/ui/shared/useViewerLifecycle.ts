/**
 * useViewerLifecycle — shared hook for all MCP App viewers.
 *
 * Handles:
 * - app.connect() + ontoolresult / ontoolinputpartial wiring
 * - requestRefresh() with throttle guard (canRequestUiRefresh)
 * - Optional auto-refresh setInterval (pass enableAutoRefresh: true)
 * - focus / visibilitychange event listeners
 * - Error state management
 * - loading / refreshing boolean state
 *
 * `parsePayload` receives the raw ToolResultPayload and returns:
 * - `{ data: T, refreshRequest?: UiRefreshRequestData }` on success
 * - `{ error: string }` on failure (sets error state, keeps data unchanged)
 * - `null` to silently ignore (rare)
 *
 * The optional `refreshRequest` returned by `parsePayload` is stored so the
 * hook can call the tool again on refresh events.
 */

import { useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import {
  canRequestUiRefresh,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "./refresh";
import { t } from "./i18n";

export type ParsePayloadResult<T> =
  | { data: T; refreshRequest?: UiRefreshRequestData }
  | { error: string }
  | null;

const TOOL_CALL_TIMEOUT_MS = 15_000;

export function useViewerLifecycle<T>({ app, minIntervalMs, parsePayload, enableAutoRefresh }: {
  app: App;
  minIntervalMs: number;
  /**
   * Parse a raw ToolResultPayload into typed data.
   * - Return `{ data, refreshRequest? }` on success
   * - Return `{ error }` on failure
   * - Return `null` to silently ignore
   */
  parsePayload: (result: ToolResultPayload) => ParsePayloadResult<T>;
  /** Set to true to enable an auto-refresh setInterval at `minIntervalMs`. */
  enableAutoRefresh?: boolean;
}): {
  data: T | null;
  error: string | null;
  refreshing: boolean;
  loading: boolean;
  onRefresh: () => void;
  onRefreshWithDelay: (delayMs: number) => void;
  onError: (msg: string | null) => void;
  hydrateData: (next: T) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const dataRef = useRef<T | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function consumeToolResult(result: ToolResultPayload) {
    const parsed = parsePayload(result);
    if (parsed === null) {
      setLoading(false);
      return;
    }
    if ("error" in parsed) {
      setError(parsed.error);
      setLoading(false);
      return;
    }
    dataRef.current = parsed.data;
    if (parsed.refreshRequest !== undefined) {
      refreshRequestRef.current = parsed.refreshRequest;
    } else {
      // Try to read refreshRequest from the data itself (all viewers embed it)
      refreshRequestRef.current = resolveUiRefreshRequest(
        parsed.data as ({ refreshRequest?: UiRefreshRequestData } | null),
        refreshRequestRef.current,
      );
    }
    setData(parsed.data);
    setError(null);
    setLoading(false);
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    const request = refreshRequestRef.current;
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: refreshInFlightRef.current,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs,
      }, options)
    ) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (!result.isError) consumeToolResult(result);
      else setError(t("error_refresh"));
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    app.connect().catch(() => {});
    app.ontoolresult = (result: ToolResultPayload) => {
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!dataRef.current) setLoading(true);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => void requestRefresh({ ignoreInterval: true });
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    };
    globalThis.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    let intervalId: ReturnType<typeof globalThis.setInterval> | undefined;
    if (enableAutoRefresh) {
      intervalId = globalThis.setInterval(() => {
        void requestRefresh();
      }, minIntervalMs);
    }

    return () => {
      globalThis.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalId !== undefined) globalThis.clearInterval(intervalId);
    };
  }, []);

  return {
    data,
    error,
    refreshing,
    loading,
    onRefresh: () => void requestRefresh({ ignoreInterval: true }),
    onRefreshWithDelay: (delayMs: number) => {
      lastRefreshStartedAtRef.current = Date.now();
      setTimeout(() => void requestRefresh({ ignoreInterval: true }), delayMs);
    },
    onError: setError,
    /**
     * Directly hydrate the data state (e.g. after a local mutation like emit).
     * Also updates the refreshRequest ref if the new data contains one.
     */
    hydrateData: (next: T) => {
      dataRef.current = next;
      refreshRequestRef.current = resolveUiRefreshRequest(
        next as ({ refreshRequest?: UiRefreshRequestData } | null),
        refreshRequestRef.current,
      );
      setData(next);
    },
  };
}
