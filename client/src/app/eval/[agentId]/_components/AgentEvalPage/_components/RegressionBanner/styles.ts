import type { CSSProperties } from "react";

/** Co-located styles for the regression banner. */
export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    color: "var(--warn)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
};
