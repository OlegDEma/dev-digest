import type { CSSProperties } from "react";

/** Co-located styles for ConventionsSkillModal. */
export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 22,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--accent-bg)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 20 } satisfies CSSProperties,
  rowItem: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
