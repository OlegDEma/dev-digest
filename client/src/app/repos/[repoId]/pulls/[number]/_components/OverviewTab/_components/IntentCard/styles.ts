import type { CSSProperties } from "react";

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
  headerRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-primary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  columns: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18 } satisfies CSSProperties,
  colTitle: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color,
    marginBottom: 6,
  }),
  list: {
    margin: 0,
    paddingLeft: 14,
    listStyleType: "'·  '",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  divider: { borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  chips: { display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 } satisfies CSSProperties,
  // Badge is nowrap by default; a long model-written label must wrap, not scroll the page.
  chip: { whiteSpace: "normal", maxWidth: "100%", overflowWrap: "anywhere" } satisfies CSSProperties,
  missing: { color: "var(--warn)" } satisfies CSSProperties,
  sourcesToggle: {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "var(--text-secondary)",
    fontSize: 12.5,
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  sourceRow: (unresolved: boolean): CSSProperties => ({
    fontSize: 12.5,
    color: unresolved ? "var(--warn)" : "var(--text-secondary)",
  }),
  footer: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
