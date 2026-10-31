import type { CSSProperties } from "react";

export const s = {
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 6px" } satisfies CSSProperties,
  field: { marginBottom: 14 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
};
