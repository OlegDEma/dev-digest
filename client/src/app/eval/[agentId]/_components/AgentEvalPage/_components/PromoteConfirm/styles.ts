import type { CSSProperties } from "react";

/** Co-located styles for the Promote confirmation. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  p: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  h3: { fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13 } satisfies CSSProperties,
  warn: { fontSize: 13, color: "var(--warn)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--warn)" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
};
