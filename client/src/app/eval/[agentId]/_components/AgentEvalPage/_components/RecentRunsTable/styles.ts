import type { CSSProperties } from "react";

/** Co-located styles for the per-agent recent runs table. */
export const s = {
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 } satisfies CSSProperties,
  h2: { fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", margin: 0, flex: 1 } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
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
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" } satisfies CSSProperties,
  scope: { color: "var(--text-muted)" } satisfies CSSProperties,
  checkbox: (checked: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 4,
    border: "1.5px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
    background: checked ? "var(--accent)" : "transparent",
    padding: 0,
    cursor: "pointer",
  }),
  reason: { fontSize: 12, color: "var(--crit)", marginTop: 2 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" } satisfies CSSProperties,
};
