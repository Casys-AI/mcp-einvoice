/**
 * ChevronIcon — expandable chevron SVG arrow.
 *
 * Points right when collapsed, rotates 90° clockwise when expanded.
 * Used for expandable sections in DirectoryCard and DirectoryList.
 */

export function ChevronIcon({ expanded, style }: {
  expanded: boolean;
  style?: Record<string, unknown>;
}) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s",
        ...style,
      }}
    >
      <path
        d="M3 1l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
