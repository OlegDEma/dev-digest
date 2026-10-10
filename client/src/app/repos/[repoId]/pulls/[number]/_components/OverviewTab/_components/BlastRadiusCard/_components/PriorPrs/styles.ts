import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform 120ms",
    flexShrink: 0,
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-secondary)",
    fontSize: 13,
    textAlign: "left",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 2, fontSize: 13 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
