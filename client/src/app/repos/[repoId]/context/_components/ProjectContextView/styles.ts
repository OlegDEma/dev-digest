import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView. */
export const s = {
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 650, margin: 0, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 640 } satisfies CSSProperties,
  notice: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" } satisfies CSSProperties,
  layout: { display: "grid", gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)", gap: 22, alignItems: "start" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  folder: { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", margin: "0 0 6px", overflowWrap: "anywhere" } satisfies CSSProperties,
  items: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  item: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    borderRadius: 6,
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "var(--accent-bg)" : "var(--bg-surface)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 13,
  }),
  itemName: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  itemMeta: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  placeholder: { padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
