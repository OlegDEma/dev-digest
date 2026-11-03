import type { CSSProperties } from "react";

export const s = {
  strip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  text: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 } satisfies CSSProperties,
  edited: { flexShrink: 0, color: "var(--warn)" } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
};
