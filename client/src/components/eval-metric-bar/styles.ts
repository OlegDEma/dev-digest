import type { CSSProperties } from "react";

/** Co-located styles for the metric bar. */
export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 8, minWidth: 110 } satisfies CSSProperties,
  bar: { flex: 1, minWidth: 48 } satisfies CSSProperties,
  text: { fontSize: 12, width: 36, textAlign: "right" } satisfies CSSProperties,
};
