/**
 * hoverRowHandlers — shared hover handlers for table/card rows.
 *
 * Returns onMouseEnter / onMouseLeave handlers that toggle a hover background
 * on the target element. When `isExpanded` is true the background is left
 * unchanged (the expanded state owns the background colour).
 *
 * Usage:
 *   const hover = fhoverRowHandlers(colors.bg.surface, isExpanded);
 *   <tr onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} />
 */

import type { MouseEvent } from "react";
import { colors } from "./theme";

export function hoverRowHandlers(
  /** Background to restore on mouse-leave. */
  defaultBg: string,
  /** When true the row is expanded — hover changes are suppressed. */
  isExpanded = false,
): {
  onMouseEnter: (e: MouseEvent) => void;
  onMouseLeave: (e: MouseEvent) => void;
} {
  return {
    onMouseEnter(e: MouseEvent) {
      if (!isExpanded) {
        (e.currentTarget as HTMLElement).style.background = colors.bg.hover;
      }
    },
    onMouseLeave(e: MouseEvent) {
      if (!isExpanded) {
        (e.currentTarget as HTMLElement).style.background = defaultBg;
      }
    },
  };
}
