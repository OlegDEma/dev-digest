import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

export interface AgentRunAggregate {
  runs: number;
  /** Null when no run in the window reported a cost. */
  totalCostUsd: number | null;
  avgCostUsd: number | null;
  avgDurationMs: number | null;
}

export interface AgentFindingAggregate {
  accepted: number;
  dismissed: number;
  pending: number;
  bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
}

export interface AgentStatsRows {
  runs: Map<string, AgentRunAggregate>;
  findings: Map<string, AgentFindingAggregate>;
}

/**
 * Per-agent quality aggregates over PR-review runs (`agent_runs`). Read-only and
 * cross-module on purpose (like the skills stats): it reads the review tables a
 * run writes, never the eval tables. Two grouped queries for any number of
 * agents; workspace scope comes from `agents.workspace_id`.
 */
export class AgentStatsRepository {
  constructor(private db: Db) {}

  async aggregate(workspaceId: string, since: Date, agentId?: string): Promise<AgentStatsRows> {
    const scope = and(
      eq(t.agents.workspaceId, workspaceId),
      eq(t.agentRuns.status, 'done'),
      gte(t.agentRuns.ranAt, since),
      ...(agentId ? [eq(t.agents.id, agentId)] : []),
    );

    const [runRows, findingRows] = await Promise.all([
      this.db
        .select({
          agentId: t.agentRuns.agentId,
          runs: sql<number>`count(*)::int`,
          totalCost: sql<number | null>`sum(${t.agentRuns.costUsd})`,
          avgCost: sql<number | null>`avg(${t.agentRuns.costUsd})`,
          avgDuration: sql<number | null>`avg(${t.agentRuns.durationMs})`,
        })
        .from(t.agentRuns)
        .innerJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
        .where(scope)
        .groupBy(t.agentRuns.agentId),
      this.db
        .select({
          agentId: t.agentRuns.agentId,
          severity: t.findings.severity,
          accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)::int`,
          dismissed: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is not null)::int`,
          pending: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null)::int`,
        })
        .from(t.agentRuns)
        .innerJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
        .innerJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.kind, 'review')))
        .innerJoin(t.findings, and(eq(t.findings.reviewId, t.reviews.id), eq(t.findings.kind, 'finding')))
        .where(scope)
        .groupBy(t.agentRuns.agentId, t.findings.severity),
    ]);

    const runs = new Map<string, AgentRunAggregate>();
    for (const r of runRows) {
      if (!r.agentId) continue;
      runs.set(r.agentId, {
        runs: r.runs,
        totalCostUsd: r.totalCost === null ? null : Number(r.totalCost),
        avgCostUsd: r.avgCost === null ? null : Number(r.avgCost),
        avgDurationMs: r.avgDuration === null ? null : Number(r.avgDuration),
      });
    }

    const findings = new Map<string, AgentFindingAggregate>();
    for (const r of findingRows) {
      if (!r.agentId) continue;
      const acc =
        findings.get(r.agentId) ??
        { accepted: 0, dismissed: 0, pending: 0, bySeverity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } };
      acc.accepted += r.accepted;
      acc.dismissed += r.dismissed;
      acc.pending += r.pending;
      if (r.severity === 'CRITICAL' || r.severity === 'WARNING' || r.severity === 'SUGGESTION') {
        acc.bySeverity[r.severity] += r.accepted + r.dismissed + r.pending;
      }
      findings.set(r.agentId, acc);
    }
    return { runs, findings };
  }
}
