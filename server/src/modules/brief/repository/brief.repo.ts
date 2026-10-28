import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

/** `pr_brief` data access: `json` holds the whole snake_case PrBrief, so no column mapping happens here. */
export async function getBriefJson(db: Db, prId: string): Promise<unknown | undefined> {
  const [row] = await db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
  return row?.json;
}

export async function upsertBrief(db: Db, prId: string, json: unknown): Promise<void> {
  await db
    .insert(t.prBrief)
    .values({ prId, json })
    .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
}

export interface SpecAttachmentRow {
  agentId: string;
  name: string;
  docs: string[];
  skills: string[][];
}

/**
 * Every agent of the workspace (name asc; agent.enabled deliberately ignored) with its own
 * context docs and the docs of its ENABLED bound skills in bind order.
 */
export async function listSpecAttachments(db: Db, workspaceId: string): Promise<SpecAttachmentRow[]> {
  const agentRows = await db
    .select({ id: t.agents.id, name: t.agents.name, docs: t.agents.contextDocs })
    .from(t.agents)
    .where(eq(t.agents.workspaceId, workspaceId))
    .orderBy(asc(t.agents.name), asc(t.agents.id));
  if (agentRows.length === 0) return [];

  const skillRows = await db
    .select({ agentId: t.agentSkills.agentId, docs: t.skills.contextDocs })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
    .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.skills.enabled, true)))
    .orderBy(asc(t.agentSkills.agentId), asc(t.agentSkills.order));

  const byAgent = new Map<string, string[][]>();
  for (const s of skillRows) {
    const list = byAgent.get(s.agentId);
    if (list) list.push(s.docs);
    else byAgent.set(s.agentId, [s.docs]);
  }
  return agentRows.map((a) => ({ agentId: a.id, name: a.name, docs: a.docs, skills: byAgent.get(a.id) ?? [] }));
}
