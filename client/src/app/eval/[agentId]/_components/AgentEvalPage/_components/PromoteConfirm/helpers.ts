import type { AgentSkillLink, EvalConfigSnapshot, SkillSummary } from "@devdigest/shared";

export interface PromotionPlan {
  promptChanged: boolean;
  model: { from: string; to: string } | null;
  strategy: { from: string; to: string } | null;
  /** Skills of the run's config the live agent does not link yet. */
  link: string[];
  /** Skills the live agent links that the run's config did not use. */
  unlink: string[];
  /** Skills of the run's config whose current version differs from the version the run used. */
  versionWarnings: { name: string; current: number; old: number }[];
  hasChanges: boolean;
}

const modelLabel = (c: EvalConfigSnapshot) => `${c.provider}/${c.model}`;

/** What Promote will change on the live agent when `target` (a run's snapshot) is applied. */
export function planPromotion(
  live: EvalConfigSnapshot,
  target: EvalConfigSnapshot,
  links: readonly AgentSkillLink[],
  skills: readonly SkillSummary[],
): PromotionPlan {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = new Set(links.map((l) => l.skill_id));
  const wanted = new Set(target.skills.map((sk) => sk.skill_id));
  const link = target.skills.filter((sk) => !linked.has(sk.skill_id)).map((sk) => sk.name);
  const unlink = links.filter((l) => !wanted.has(l.skill_id)).map((l) => byId.get(l.skill_id)?.name ?? l.skill_id);
  const versionWarnings = target.skills.flatMap((sk) => {
    const cur = byId.get(sk.skill_id);
    return cur && cur.version !== sk.version ? [{ name: sk.name, current: cur.version, old: sk.version }] : [];
  });
  const promptChanged = live.system_prompt !== target.system_prompt;
  const model = modelLabel(live) !== modelLabel(target) ? { from: modelLabel(live), to: modelLabel(target) } : null;
  const strategy = live.strategy !== target.strategy ? { from: live.strategy, to: target.strategy } : null;
  return {
    promptChanged,
    model,
    strategy,
    link,
    unlink,
    versionWarnings,
    hasChanges: promptChanged || !!model || !!strategy || link.length > 0 || unlink.length > 0,
  };
}
