import type { SkillSummary, SkillType } from "@devdigest/shared";
import { DEFAULT_TAB, EDITOR_TABS, TYPE_COLOR, type EditorTabKey } from "./constants";

/** Resolve the chip / icon colours for a skill type (unknown → the `custom` pair). */
export function typeColor(type: SkillType): { color: string; bg: string } {
  return TYPE_COLOR[type] ?? TYPE_COLOR.custom;
}

/** Case-insensitive filter over a skill's name + description + type; keeps order. */
export function filterSkills(skills: SkillSummary[], search: string): SkillSummary[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description} ${s.type}`.toLowerCase().includes(q));
}

/** `?tab=` → a known editor tab, falling back to Config. */
export function resolveTab(raw: string | null | undefined): EditorTabKey {
  return (EDITOR_TABS as readonly string[]).includes(raw ?? "") ? (raw as EditorTabKey) : DEFAULT_TAB;
}

/** Path of a skill in the editor, keeping the current tab. */
export function skillHref(id: string, tab: EditorTabKey): string {
  return `/skills/${id}?tab=${tab}`;
}
