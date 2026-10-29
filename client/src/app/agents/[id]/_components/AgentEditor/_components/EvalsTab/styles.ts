import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's Evals tab. */
export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 } satisfies CSSProperties,
  titles: { flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  reconnecting: { fontSize: 13, color: "var(--warn)", marginBottom: 12 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
  link: { color: "var(--accent)", marginLeft: 8 } satisfies CSSProperties,
};
