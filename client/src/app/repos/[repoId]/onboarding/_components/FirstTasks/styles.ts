import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 650, margin: 0 } satisfies CSSProperties,
  rationale: { fontSize: 13, color: "var(--text-secondary)", margin: "3px 0 6px" } satisfies CSSProperties,
  paths: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  pathRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, fontSize: 12.5, overflowWrap: "anywhere" } satisfies CSSProperties,
  link: { fontSize: 12.5, color: "var(--accent)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
