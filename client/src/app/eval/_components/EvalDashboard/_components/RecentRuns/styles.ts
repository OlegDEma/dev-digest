import type { CSSProperties } from "react";

/** Co-located styles for the Eval Dashboard recent-runs table. */
export const s = {
  h2: { fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 10 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  tr: { cursor: "pointer" } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  link: { color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
