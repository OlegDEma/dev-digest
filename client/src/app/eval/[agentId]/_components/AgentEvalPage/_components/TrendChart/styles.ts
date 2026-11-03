import type { CSSProperties } from "react";

/** Co-located styles for the metric trend chart. */
export const s = {
  figure: { margin: 0, marginBottom: 24 } satisfies CSSProperties,
  svg: { width: "100%", maxWidth: 620, height: "auto", display: "block" } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }),
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "16px 0", marginBottom: 24 } satisfies CSSProperties,
};
