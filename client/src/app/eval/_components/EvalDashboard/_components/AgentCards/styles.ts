import type { CSSProperties } from "react";

/** Co-located styles for the Eval Dashboard agent cards. */
export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 14,
    marginBottom: 32,
  } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    textDecoration: "none",
    minWidth: 0,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  model: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  metrics: { display: "flex", gap: 14, marginTop: 4 } satisfies CSSProperties,
  metric: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  metricLabel: { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  metricValue: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
};
