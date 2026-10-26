import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 260 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 400, margin: 0, letterSpacing: "-0.02em" } satisfies CSSProperties,
  name: { fontWeight: 700 } satisfies CSSProperties,
  line: { fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0" } satisfies CSSProperties,
  badges: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" } satisfies CSSProperties,
  stale: { fontSize: 12.5, color: "var(--warn, var(--text-secondary))" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  reasons: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
