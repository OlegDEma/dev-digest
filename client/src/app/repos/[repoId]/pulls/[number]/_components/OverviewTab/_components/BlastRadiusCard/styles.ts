import type { CSSProperties } from "react";

/** Symbol rows shown before "Show all N". */
export const SYMBOL_ROWS = 10;

export const s = {
  // SectionLabel carries its own bottom margin; the card's flex gap already spaces it.
  title: { marginBottom: -14 } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  // Stats and toggle share one row; the stats wrap among themselves before the toggle ever drops to its own line.
  headerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" } satisfies CSSProperties,
  stats: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 10px", flex: 1, minWidth: 0 } satisfies CSSProperties,
  toggleSlot: { flexShrink: 0 } satisfies CSSProperties,
  stat: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, whiteSpace: "nowrap", color: "var(--text-secondary)" } satisfies CSSProperties,
  statValue: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  hint: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  degradedRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
