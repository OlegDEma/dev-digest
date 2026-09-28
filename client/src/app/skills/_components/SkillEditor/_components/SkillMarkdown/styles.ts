import type { CSSProperties } from "react";

/** Co-located styles for SkillMarkdown — the rendered-body look of the design. */
export const s = {
  root: { fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px", letterSpacing: "-0.01em" } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: "22px 0 10px" } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 650, color: "var(--text-primary)", margin: "18px 0 8px" } satisfies CSSProperties,
  p: { margin: "0 0 12px" } satisfies CSSProperties,
  strong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  ul: { margin: "0 0 12px", paddingLeft: 22, listStyle: "disc" } satisfies CSSProperties,
  ol: { margin: "0 0 12px", paddingLeft: 22, listStyle: "decimal" } satisfies CSSProperties,
  li: { margin: "4px 0" } satisfies CSSProperties,
  code: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  pre: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    lineHeight: 1.55,
    padding: "12px 14px",
    borderRadius: 8,
    background: "var(--code-bg, var(--bg-primary))",
    border: "1px solid var(--border)",
    overflow: "auto",
    margin: "0 0 12px",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  blockquote: {
    margin: "0 0 12px",
    padding: "4px 14px",
    borderLeft: "3px solid var(--border-strong)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  hr: { border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" } satisfies CSSProperties,
  a: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  table: { borderCollapse: "collapse", margin: "0 0 12px", fontSize: 13 } satisfies CSSProperties,
  cell: { border: "1px solid var(--border)", padding: "4px 10px", textAlign: "left" } satisfies CSSProperties,
} as const;
