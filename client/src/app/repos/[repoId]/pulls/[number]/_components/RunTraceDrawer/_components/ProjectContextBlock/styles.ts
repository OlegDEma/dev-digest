import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextBlock (the block frame reuses the drawer's prompt styles). */
export const s = {
  items: { borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  item: { borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  itemHead: { display: "flex", alignItems: "center", gap: 8, padding: "7px 12px" } satisfies CSSProperties,
  itemToggle: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--text-primary)",
    textAlign: "left",
    cursor: "pointer",
    fontSize: 12.5,
  } satisfies CSSProperties,
  itemPath: { overflowWrap: "anywhere" } satisfies CSSProperties,
  itemRepo: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  itemBody: { padding: "0 12px 10px" } satisfies CSSProperties,
  searchRow: { marginBottom: 8 } satisfies CSSProperties,
  mark: { background: "var(--accent)", color: "var(--bg-primary)", borderRadius: 2 } satisfies CSSProperties,
  noMatch: { fontSize: 12, color: "var(--text-muted)", padding: "6px 0" } satisfies CSSProperties,
  skipped: { padding: "8px 12px" } satisfies CSSProperties,
  skippedTitle: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } satisfies CSSProperties,
  skippedList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  skippedItem: { fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  reason: { color: "var(--warn)" } satisfies CSSProperties,
} as const;
