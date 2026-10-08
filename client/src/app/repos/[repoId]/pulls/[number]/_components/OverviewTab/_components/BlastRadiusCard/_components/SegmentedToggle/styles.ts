import type { CSSProperties } from "react";

export const s = {
  track: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  segment: (active: boolean): CSSProperties => ({
    border: "none",
    borderRadius: 4,
    padding: "2px 10px",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    background: active ? "var(--bg-primary)" : "transparent",
  }),
} as const;
