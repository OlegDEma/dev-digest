import type { CSSProperties } from "react";

export const s = {
  note: { fontSize: 13, color: "var(--text-muted)", margin: "10px 0 0" } satisfies CSSProperties,
  diagram: { marginTop: 12 } satisfies CSSProperties,
} as const;
