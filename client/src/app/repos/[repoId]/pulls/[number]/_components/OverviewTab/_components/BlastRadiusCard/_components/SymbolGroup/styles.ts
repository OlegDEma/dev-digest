import type { CSSProperties } from "react";

/** Endpoint / cron chips shown per row before "+N more". */
export const CHIP_MAX = 6;

export const s = {
  group: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "var(--bg-hover)",
    border: "none",
    borderRadius: 6,
    padding: "7px 10px",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  headerStatic: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--bg-hover)",
    borderRadius: 6,
    padding: "7px 10px",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  codeIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  symbol: { fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginLeft: 14,
    paddingLeft: 10,
    borderLeft: "1px solid var(--border)",
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  chips: { display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 } satisfies CSSProperties,
  chip: { whiteSpace: "normal", maxWidth: "100%", overflowWrap: "anywhere" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
