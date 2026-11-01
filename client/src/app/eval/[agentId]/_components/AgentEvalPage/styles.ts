import type { CSSProperties } from "react";

/** Co-located styles for the per-agent eval page. */
export const s = {
  page: { padding: "24px 28px", maxWidth: 1100 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 } satisfies CSSProperties,
  back: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  select: { minWidth: 200, flex: "0 1 260px" } satisfies CSSProperties,
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } satisfies CSSProperties,
  ranges: { display: "flex", gap: 6, marginLeft: "auto" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 16 } satisfies CSSProperties,
  h2: { fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", margin: "0 0 8px" } satisfies CSSProperties,
  progress: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
};
