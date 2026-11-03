import type { CSSProperties } from "react";

/** Co-located styles for the finding-case context summary. */
export const s = {
  root: { fontSize: 12, color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  toggle: { background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--accent)", cursor: "pointer", textDecoration: "underline" } satisfies CSSProperties,
  list: { flexBasis: "100%", margin: "4px 0 0", paddingLeft: 18, color: "var(--text-muted)", wordBreak: "break-all" } satisfies CSSProperties,
};
