/**
 * StatusBadge — renders a colored status pill using the shared CDAR status registry.
 *
 * Uses `getStatus(code)` to resolve any status format (CDAR numeric, prefixed,
 * Iopole enum, AFNOR string) to a label + color + background.
 */

import { styles } from "./theme";
import { getStatus } from "./status";

export function StatusBadge({ code }: { code: string }) {
  const s = getStatus(code);
  return <span style={styles.badge(s.color, s.bg)}>{s.label}</span>;
}
