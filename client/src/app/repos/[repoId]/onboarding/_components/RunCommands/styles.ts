import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  order: { width: 20, fontSize: 12.5, color: "var(--text-muted)", textAlign: "right" } satisfies CSSProperties,
  code: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, whiteSpace: "pre", overflowX: "auto", maxWidth: "100%" } satisfies CSSProperties,
  codeWrap: { flex: 1, minWidth: 0, overflowX: "auto" } satisfies CSSProperties,
  annotation: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  skipped: { marginTop: 14 } satisfies CSSProperties,
  skippedTitle: { fontSize: 12.5, fontWeight: 650, color: "var(--text-secondary)", margin: "0 0 4px" } satisfies CSSProperties,
  skippedList: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
