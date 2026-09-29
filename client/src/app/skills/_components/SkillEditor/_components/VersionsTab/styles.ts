import type { CSSProperties } from "react";
import type { DiffLineType } from "./diff";

/** Co-located styles for the Versions tab (history list + inline diff). */
export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "2px 0 14px",
    maxWidth: 640,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,

  row: (current: boolean): CSSProperties => ({
    border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "hidden",
  }),
  rowMain: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" } satisfies CSSProperties,
  ver: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  currentPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--ok)",
    background: "var(--ok-bg)",
    borderRadius: 999,
    padding: "2px 9px",
  } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  counts: { display: "inline-flex", gap: 8, fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  add: { color: "var(--ok)" } satisfies CSSProperties,
  del: { color: "var(--crit)" } satisfies CSSProperties,

  diffPanel: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg-base)",
  } satisfies CSSProperties,
  initialNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  noChange: { fontSize: 12.5, color: "var(--text-muted)", padding: "12px 14px" } satisfies CSSProperties,
  diffPre: {
    margin: 0,
    padding: "8px 0",
    fontSize: 12,
    lineHeight: 1.6,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    overflowX: "auto",
    maxHeight: 360,
    overflowY: "auto",
  } satisfies CSSProperties,
  diffLine: (type: DiffLineType): CSSProperties => ({
    display: "flex",
    gap: 8,
    padding: "0 14px",
    whiteSpace: "pre",
    color:
      type === "add" ? "var(--ok)" : type === "del" ? "var(--crit)" : "var(--text-secondary)",
    background:
      type === "add" ? "var(--ok-bg)" : type === "del" ? "var(--crit-bg)" : "transparent",
  }),
  gutter: { userSelect: "none", opacity: 0.7, width: 8, flexShrink: 0 } satisfies CSSProperties,
} as const;
