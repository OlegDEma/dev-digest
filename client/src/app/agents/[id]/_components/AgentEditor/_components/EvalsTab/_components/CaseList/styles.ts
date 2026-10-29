import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab case list. */
export const s = {
  wrap: { marginBottom: 28 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  passing: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  hint: { color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: { display: "flex", gap: 10, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  result: { fontSize: 12, color: "var(--text-secondary)", maxWidth: 260, textAlign: "right" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" } satisfies CSSProperties,
};
