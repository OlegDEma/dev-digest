import type { CSSProperties } from "react";

/** Co-located styles for the agent StatsTab (tiles, mirrors the skill StatsTab). */
export const s = {
  wrap: { maxWidth: 1100, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  window: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 } satisfies CSSProperties,
  tile: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 20px 22px",
    minHeight: 110,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  tileValue: { fontSize: 34, fontWeight: 700, lineHeight: 1, color: "var(--text-primary)" } satisfies CSSProperties,
  tileUnit: { fontSize: 15, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  severityRow: { display: "flex", gap: 18, flexWrap: "wrap" } satisfies CSSProperties,
  severityItem: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  severityValue: { fontSize: 24, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  severityLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
