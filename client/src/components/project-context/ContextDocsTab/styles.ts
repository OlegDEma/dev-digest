import type { CSSProperties } from "react";

/** Co-located styles for ContextDocsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 860 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 650, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  footer: { display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 } satisfies CSSProperties,
  total: { fontSize: 14, fontWeight: 650 } satisfies CSSProperties,
  serializes: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  serializesLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  serializesPre: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--code-bg)",
    fontSize: 12.5,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  state: { padding: "20px 0", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
