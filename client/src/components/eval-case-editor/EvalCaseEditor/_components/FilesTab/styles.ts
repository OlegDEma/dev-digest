import type { CSSProperties } from "react";

export const s = {
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" } satisfies CSSProperties,
  entry: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  pathRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  grow: { flex: 1 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  contextOnly: { fontSize: 12, color: "var(--warn)", marginTop: 6 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  add: { marginTop: 4 } satisfies CSSProperties,
};
