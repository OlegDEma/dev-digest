import type { CSSProperties } from "react";

export const s = {
  nav: { margin: "0 0 16px" } satisfies CSSProperties,
  label: { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", margin: "0 0 6px", textTransform: "uppercase" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  item: { background: "none", font: "inherit", cursor: "pointer", fontSize: 13, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 99, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
