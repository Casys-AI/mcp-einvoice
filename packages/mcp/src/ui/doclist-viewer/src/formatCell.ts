import { formatNumber } from "~/shared/theme";
import { t } from "~/shared/i18n";

export function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (!isFinite(value)) return "—";
    return formatNumber(value, value % 1 === 0 ? 0 : 2);
  }
  if (typeof value === "boolean") return value ? t("yes") : t("no");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
