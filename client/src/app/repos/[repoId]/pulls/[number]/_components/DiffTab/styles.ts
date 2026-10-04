import type { CSSProperties } from "react";

export const s = {
  subRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  controls: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  notice: { fontSize: 12.5, color: "var(--warn)", marginBottom: 10 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
