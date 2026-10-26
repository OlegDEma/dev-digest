import type { CSSProperties } from "react";

export const s = {
  title: { marginBottom: -14 } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, minWidth: 0 } satisfies CSSProperties,
  link: {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "var(--accent, var(--text-secondary))",
    fontSize: 12.5,
    cursor: "pointer",
    textAlign: "left",
    overflowWrap: "anywhere",
    maxWidth: "100%",
  } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere", minWidth: 0 } satisfies CSSProperties,
  marker: { fontSize: 11, color: "var(--warn)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
