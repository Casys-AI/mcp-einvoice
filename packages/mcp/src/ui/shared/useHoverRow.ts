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
