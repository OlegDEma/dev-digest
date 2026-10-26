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
    gap: 12,
  } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  warn: { fontSize: 12.5, color: "var(--warn)", overflowWrap: "anywhere" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
