import type { CSSProperties } from "react";

/** Co-located styles for PromptModalBody. */
export const s = {
  mark: { background: "var(--accent)", color: "var(--bg-primary)", borderRadius: 2 } satisfies CSSProperties,
  wrap: { display: "flex", flexDirection: "column", height: "70vh" } satisfies CSSProperties,
  searchBar: { padding: "12px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  noMatch: { padding: "32px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  pre: { margin: 0, padding: "16px 24px", whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.6 } satisfies CSSProperties,
} as const;
