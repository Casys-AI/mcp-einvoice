import { useEffect, useRef, useState } from "react";

const DEFAULT_BREAKPOINT = 420;

export function useCompactMode(
  breakpoint = DEFAULT_BREAKPOINT,
): [boolean, React.RefObject<HTMLDivElement | null>] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setCompact(entry.contentRect.width < breakpoint);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);
  return [compact, ref];
}
