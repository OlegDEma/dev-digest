import type { CSSProperties } from "react";

/** Co-located styles for the SkillEditor shell (header + tab bar + body). */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  iconBox: (color: string, bg: string): CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    background: bg,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  title: { fontSize: 18, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  headActions: { marginLeft: "auto", display: "flex", gap: 10 } satisfies CSSProperties,
  tabsBar: { marginTop: 14, padding: "0 4px" } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28, minHeight: 0 } satisfies CSSProperties,
} as const;
