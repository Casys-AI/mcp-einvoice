/**
 * Shared feedback components — error banners and success messages.
 * Used by all MCP Apps viewers for consistent error/success display.
 */

import { colors } from "~/shared/theme";

interface FeedbackBannerProps {
  type: "error" | "success";
  message: string;
  onDismiss?: () => void;
}

export function FeedbackBanner({ type, message, onDismiss }: FeedbackBannerProps) {
  const isError = type === "error";
  return (
    <div style={{
      fontSize: 12,
      color: isError ? colors.error : colors.success,
      background: isError ? colors.errorDim : colors.successDim,
      border: `1px solid ${isError ? colors.error : colors.success}`,
      borderRadius: 6,
      padding: "8px 12px",
      marginBottom: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{
          background: "none", border: "none", color: "inherit",
          cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1,
        }}>
          &times;
        </button>
      )}
    </div>
  );
}

/** SVG icon for empty invoice state */
export function EmptyInvoiceIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="4" width="32" height="40" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <line x1="14" y1="14" x2="34" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="20" x2="28" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="14" y1="26" x2="30" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="14" y1="32" x2="24" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

/** SVG icon for empty timeline state */
export function EmptyTimelineIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="16" y1="8" x2="16" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <circle cx="16" cy="14" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="16" cy="26" r="4" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
      <circle cx="16" cy="38" r="4" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />
      <line x1="24" y1="14" x2="38" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="26" x2="34" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="24" y1="38" x2="30" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}
