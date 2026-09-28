import type { CSSProperties } from "react";

/** Co-located styles for ReviewRunAccordion. Dynamic bits (chevron rotation,
    delete-button cursor, spinner) are merged at the call site. */
export const s = {
  root: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    marginBottom: 14,
    overflow: "hidden",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 16px",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  cpuIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  agentName: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  when: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  delBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  } satisfies CSSProperties,
  chevron: { transition: "transform .15s", color: "var(--text-muted)" } satisfies CSSProperties,
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
  bannerWrap: { marginBottom: 16 } satisfies CSSProperties,
} as const;
