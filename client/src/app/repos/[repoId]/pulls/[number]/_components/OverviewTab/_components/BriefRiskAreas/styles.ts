import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  heading: { fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({ color, display: "inline-flex", flexShrink: 0 }),
  title: { fontSize: 13, color: "var(--text-primary)", fontWeight: 500, overflowWrap: "anywhere", flex: 1, minWidth: 0 } satisfies CSSProperties,
  link: {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "var(--accent, var(--text-secondary))",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "left",
    overflowWrap: "anywhere",
    maxWidth: "100%",
  } satisfies CSSProperties,
  toggle: {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "var(--text-secondary)",
    fontSize: 12,
    cursor: "pointer",
  } satisfies CSSProperties,
  details: { display: "flex", flexDirection: "column", gap: 4, paddingLeft: 22, minWidth: 0 } satisfies CSSProperties,
  explanation: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, overflowWrap: "anywhere" } satisfies CSSProperties,
  refs: { display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
