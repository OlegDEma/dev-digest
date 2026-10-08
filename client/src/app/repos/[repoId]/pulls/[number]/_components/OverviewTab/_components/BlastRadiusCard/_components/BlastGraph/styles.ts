import type { CSSProperties } from "react";

/* Layout limits (not data caps). */
export const MAX_FACT_NODES = 30;
/** Gap between columns, and the width used before the container has been measured. */
export const COL_GAP = 24;
export const DEFAULT_WIDTH = 480;
/** Approx. advance of one 12px mono glyph; sizes label truncation to the node width. */
export const CHAR_W = 7.3;
export const NODE_H = 28;
export const ROW_GAP = 12;
export const PAD = 8;
/* Below this the container is too narrow to lay out three readable columns. */
export const MIN_WIDTH = 360;

export type NodeKind = "symbol" | "caller" | "endpoint" | "cron" | "more";

export const STROKE: Record<NodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
  more: "var(--border)",
};

export const s = {
  scroll: { overflowX: "auto", width: "100%" } satisfies CSSProperties,
  svg: { display: "block" } satisfies CSSProperties,
  rect: (kind: NodeKind, focused: boolean): CSSProperties => ({
    fill: "var(--bg-elevated)",
    stroke: focused ? "var(--accent)" : STROKE[kind],
    strokeWidth: focused ? 3 : 1,
  }),
  edge: (active: boolean): CSSProperties => ({
    stroke: active ? "var(--accent)" : "var(--text-secondary)",
    strokeOpacity: active ? 1 : 0.55,
    strokeWidth: 1.25,
  }),
  text: (kind: NodeKind): CSSProperties => ({
    fill: kind === "caller" || kind === "more" ? "var(--text-secondary)" : "var(--text-primary)",
    fontSize: 12,
  }),
  select: {
    alignSelf: "flex-start",
    marginBottom: 8,
    padding: "4px 8px",
    fontSize: 12.5,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 6,
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)", marginTop: 8 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (kind: NodeKind): CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: STROKE[kind],
  }),
  muted: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
