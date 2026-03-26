import { getStatus } from "~/shared/status";

export function StatusCell({ value }: { value: string }) {
  const s = getStatus(value);
  return (
    <span
      title={s.label}
      style={{
        display: "inline-block",
        width: 3,
        height: 20,
        borderRadius: 3,
        background: s.color,
        opacity: 0.85,
        cursor: "default",
      }}
    />
  );
}
