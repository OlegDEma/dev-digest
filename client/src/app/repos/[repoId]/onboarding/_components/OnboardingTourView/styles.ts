import type { CSSProperties } from "react";

export const s = {
  empty: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, padding: "60px 28px" } satisfies CSSProperties,
  emptyTitle: { fontSize: 18, fontWeight: 650, margin: 0 } satisfies CSSProperties,
  emptyBody: { fontSize: 14, color: "var(--text-secondary)", maxWidth: 520, lineHeight: 1.5, margin: 0 } satisfies CSSProperties,
} as const;
