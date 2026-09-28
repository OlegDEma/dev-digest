import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  const { expected, timeoutMs = 10_000 } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? terminal.length >= expected
        : runs.length > 0 && terminal.length === runs.length;
    if (done) return runs;
    if (Date.now() - start > timeoutMs) return runs;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * The run row flips to `done` BEFORE its trace document is written
 * (`completeAgentRun` → `saveRunTrace` in run-executor), so a test that reads
 * `/runs/:id/trace` right after `waitForPrRuns` can race a 404 under load. Poll
 * the route until the trace exists.
 */
export async function waitForRunTrace(
  app: { inject: (opts: { method: 'GET'; url: string }) => Promise<{ statusCode: number; json: () => unknown }> },
  runId: string,
  timeoutMs = 10_000,
): Promise<unknown> {
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    if (res.statusCode === 200) return res.json();
    if (Date.now() - start > timeoutMs) throw new Error(`trace for run ${runId} not persisted within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
