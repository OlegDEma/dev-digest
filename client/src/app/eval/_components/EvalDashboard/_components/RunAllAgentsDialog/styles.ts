import type { CSSProperties } from "react";

/** Co-located styles for the Run all agents dialog. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  p: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  h3: { fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", margin: "0 0 4px" } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13 } satisfies CSSProperties,
  total: { margin: 0, fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  muted: { margin: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
};
