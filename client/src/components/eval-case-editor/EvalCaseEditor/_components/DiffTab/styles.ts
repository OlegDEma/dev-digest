import type { CSSProperties } from "react";

export const s = {
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", margin: "12px 0 6px" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  preview: {
    margin: 0,
    maxHeight: 220,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--code-bg)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  line: (kind: "add" | "hunk" | "plain"): CSSProperties => ({
    whiteSpace: "pre",
    padding: "0 10px",
    background: kind === "add" ? "var(--code-add)" : undefined,
    color: kind === "add" ? "var(--code-add-text)" : kind === "hunk" ? "var(--accent-text)" : "var(--text-secondary)",
  }),
};
