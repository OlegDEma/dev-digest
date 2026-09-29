import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/**
 * Feature-level constants shared by the rail cards, the editor header and the
 * config form (`/skills` and `/skills/[id]`). Design tokens only.
 */

/** Skill type → chip / icon colours (text, background). */
export const TYPE_COLOR: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Skill source → the small icon shown next to its label on a rail card. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "GitBranch",
  community: "Globe",
  imported_url: "Link",
};

/** Selectable skill types in forms (labels come from `skills.card.type.*`). */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Type pre-selected for a brand-new skill. */
export const DEFAULT_NEW_TYPE: SkillType = "custom";

/** Editor tab keys, in tab-bar order (Evals + Versions are placeholders for now). */
export const EDITOR_TABS = ["config", "preview", "evals", "stats", "versions"] as const;
export type EditorTabKey = (typeof EDITOR_TABS)[number];
export const DEFAULT_TAB: EditorTabKey = "config";

/** Width of the left rail (px). */
export const RAIL_WIDTH = 340;
