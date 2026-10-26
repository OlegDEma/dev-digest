/** Bucket → badge colours (design tokens only). */
export const BUCKET_COLOR: Record<string, { color: string; bg: string }> = {
  specs: { color: "var(--accent)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
};

export const NEUTRAL_BUCKET_COLOR = { color: "var(--text-secondary)", bg: "var(--bg-hover)" };
