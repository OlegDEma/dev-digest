import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  order: { width: 22, fontSize: 12.5, color: "var(--text-muted)", textAlign: "right" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  path: { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  text: { fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 0", overflowWrap: "anywhere" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  link: { fontSize: 12.5, color: "var(--accent)", whiteSpace: "nowrap" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
