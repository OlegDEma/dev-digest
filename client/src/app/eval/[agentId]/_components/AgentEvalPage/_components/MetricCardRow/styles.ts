import type { CSSProperties } from "react";

/** Co-located styles for the per-agent metric cards. */
export const s = {
  row: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  card: { padding: 16, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  top: { display: "flex", justifyContent: "space-between", alignItems: "center" } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-muted)" } satisfies CSSProperties,
  bottom: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700 } satisfies CSSProperties,
  delta: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
};
