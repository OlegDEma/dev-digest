import type { CSSProperties } from "react";

/** Co-located styles for DocRow. */
export const s = {
  row: (attached: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: attached ? "var(--bg-elevated)" : "var(--bg-surface)",
    opacity: dragging ? 0.5 : 1,
  }),
  handle: { cursor: "grab", color: "var(--text-muted)", display: "inline-flex", flexShrink: 0 } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
  absent: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  marker: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 } satisfies CSSProperties,
} as const;
