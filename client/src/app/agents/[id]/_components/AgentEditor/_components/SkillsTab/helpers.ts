import type { AgentSkillLink, SkillSummary } from "@devdigest/shared";

/** One list row: the skill plus whether this agent binds it. */
export interface SkillRow {
  skill: SkillSummary;
  bound: boolean;
}

/**
 * Bound skills first, in link `order`; unbound after, by name. A link whose
 * skill no longer exists (deleted meanwhile) is dropped rather than rendered.
 */
export function buildRows(skills: SkillSummary[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const bound = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => byId.get(l.skill_id))
    .filter((s): s is SkillSummary => !!s)
    .map((skill) => ({ skill, bound: true }));
  const boundIds = new Set(bound.map((r) => r.skill.id));
  const unbound = skills
    .filter((s) => !boundIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, bound: false }));
  return [...bound, ...unbound];
}

/** Case-insensitive filter over name + description + type; keeps row order. */
export function filterRows(rows: SkillRow[], search: string): SkillRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${r.skill.name} ${r.skill.description} ${r.skill.type}`.toLowerCase().includes(q));
}

/** The ordered bound ids after binding / unbinding one skill. */
export function toggleBound(boundIds: string[], skillId: string, bound: boolean): string[] {
  if (bound) return boundIds.includes(skillId) ? boundIds : [...boundIds, skillId];
  return boundIds.filter((id) => id !== skillId);
}

/** Move the item at `from` to `to` (both indexes into the bound list). */
export function moveBound(boundIds: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= boundIds.length || to >= boundIds.length) return boundIds;
  const next = [...boundIds];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
