import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's CI tab. */
export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 } satisfies CSSProperties,
  titles: { flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  status: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: { fontSize: 13, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", alignItems: "flex-end" } satisfies CSSProperties,
};
