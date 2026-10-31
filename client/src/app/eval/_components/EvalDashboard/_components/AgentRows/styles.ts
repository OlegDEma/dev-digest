import type { CSSProperties } from "react";

/** Co-located styles for the Eval Dashboard agent rows. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1.4fr) minmax(200px, 1.6fr) 90px auto 16px",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  nameCol: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  chip: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 99,
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  last: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  spark: { display: "flex", justifyContent: "center" } satisfies CSSProperties,
  metrics: { display: "flex", gap: 14 } satisfies CSSProperties,
  metric: { display: "flex", flexDirection: "column", alignItems: "flex-start" } satisfies CSSProperties,
  metricLabel: { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  metricValue: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)" } satisfies CSSProperties,
};
