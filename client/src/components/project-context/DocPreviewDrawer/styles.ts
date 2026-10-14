import type { CSSProperties } from "react";

/** Co-located styles for DocPreviewDrawer. */
export const s = {
  body: { outline: "none" } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  path: { fontSize: 12.5, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  marker: { padding: "24px 0", color: "var(--warn)", fontSize: 13 } satisfies CSSProperties,
  attach: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
