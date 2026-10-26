import type { CSSProperties } from "react";

/** Co-located styles for DocumentPane. */
export const s = {
  pane: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  path: { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  modes: { display: "flex", gap: 6 } satisfies CSSProperties,
  marker: { padding: "24px 0", color: "var(--warn)", fontSize: 13 } satisfies CSSProperties,
  warn: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  error: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 420,
    resize: "vertical",
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.55,
    outline: "none",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  dirty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
