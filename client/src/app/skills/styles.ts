import type { CSSProperties } from "react";
import { RAIL_WIDTH } from "./constants";

/** Shell layout shared by `/skills` and `/skills/[id]` (mirrors `/agents/[id]`). */
export const s = {
  shell: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  editorCol: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  editorLoading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  landing: { flex: 1, display: "grid", placeItems: "center", padding: 28 } satisfies CSSProperties,
} as const;
