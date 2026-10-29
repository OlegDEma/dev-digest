import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab run history. */
export const s = {
  wrap: { marginBottom: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
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
  checkbox: (checked: boolean, disabled: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 4,
    border: "1px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
    background: checked ? "var(--accent)" : "transparent",
    display: "inline-grid",
    placeItems: "center",
    padding: 0,
    cursor: disabled ? "default" : "pointer",
  }),
  reason: { fontSize: 12, color: "var(--crit)", marginTop: 2 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" } satisfies CSSProperties,
};
