import type { CSSProperties } from "react";

/** Co-located styles for the finding card's "Turn into eval case" action. */
export const s = {
  hint: { fontSize: 12, color: "var(--text-muted)", alignSelf: "center" } satisfies CSSProperties,
  result: { flexBasis: "100%", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { flexBasis: "100%", fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  link: { color: "var(--accent)", marginLeft: 8 } satisfies CSSProperties,
};
