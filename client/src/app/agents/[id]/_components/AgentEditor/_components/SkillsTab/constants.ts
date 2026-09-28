/** Constants for the agent editor's Skills tab. */

/** MIME type used for the HTML5 drag payload (the dragged bound-row index). */
export const DRAG_MIME = "application/x-devdigest-skill-index";

/** Skill type → chip colours, same pairs the /skills cards use. */
export const TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
