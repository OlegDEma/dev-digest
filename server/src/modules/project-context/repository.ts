import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface AttachedRow {
  agentId: string;
  docs: string[];
}

/**
 * Project-context data access: which agents attach which paths. Workspace-scoped;
 * `enabled` flags are deliberately ignored (AC-11: usage, not activity).
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  async attachedPathsByAgent(workspaceId: string): Promise<AttachedRow[]> {
    const direct = await this.db
      .select({ agentId: t.agents.id, docs: t.agents.contextDocs })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    const viaSkills = await this.db
      .select({ agentId: t.agentSkills.agentId, docs: t.skills.contextDocs })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId));
    return [...direct, ...viaSkills].filter((r) => r.docs.length > 0);
  }
}
