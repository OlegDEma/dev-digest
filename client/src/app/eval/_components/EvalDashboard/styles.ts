import type { CSSProperties } from "react";

/** Co-located styles for the Eval Dashboard page. */
export const s = {
  page: { padding: "24px 28px", maxWidth: 1100 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } satisfies CSSProperties,
  running: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  skeletons: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 } satisfies CSSProperties,
};
