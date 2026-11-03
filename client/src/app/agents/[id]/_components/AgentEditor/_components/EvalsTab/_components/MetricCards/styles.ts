import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab metric cards. */
export const s = {
  wrap: { marginBottom: 24 } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  card: {
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies CSSProperties,
  label: { fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  value: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  delta: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  secondary: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", marginTop: 10 } satisfies CSSProperties,
  skeletons: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
};
