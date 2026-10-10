import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestApi } from '../api/port.js';
import { errorResult, toToolError } from '../errors.js';
import { reviewAnswer, runningAnswer } from '../format.js';
import { resolveAgent, resolvePr, resolveRepo } from '../resolve.js';
import { runReview } from '../run-review.js';
import * as T from '../texts.js';
import { okText, type ToolOpts } from './types.js';

export function register(server: McpServer, api: DevDigestApi, opts: ToolOpts): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: T.TOOL_TEXTS.run_agent_on_pr.title,
      description: T.TOOL_TEXTS.run_agent_on_pr.description,
      inputSchema: {
        repo: z.string().describe(T.DESCRIBE.repo),
        pr: z.number().int().positive().describe(T.DESCRIBE.pr),
        agent: z.string().describe(T.DESCRIBE.agent),
        limit: z.number().int().min(1).max(100).default(20).describe(T.DESCRIBE.limit),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ repo, pr, agent, limit }, extra) => {
      try {
        const repoRow = await resolveRepo(api, repo);
        const prRow = await resolvePr(api, repoRow, pr);
        const agentRow = await resolveAgent(api, agent);

        const progressToken = extra._meta?.progressToken;
        const onTick =
          progressToken === undefined
            ? undefined
            : (elapsedSec: number, waitSec: number) => {
                void extra
                  .sendNotification({
                    method: 'notifications/progress',
                    params: {
                      progressToken,
                      progress: elapsedSec,
                      total: waitSec,
                      message: 'review running',
                    },
                  })
                  .catch(() => {});
              };

        const outcome = await runReview(
          api,
          { prId: prRow.id, agentId: agentRow.id },
          { signal: extra.signal, onTick, waitSec: opts.runWaitSec, pollMs: opts.pollMs },
        );

        switch (outcome.kind) {
          case 'done':
            return okText(
              reviewAnswer(outcome.detail, {
                limit,
                offset: 0,
                detail: 'brief',
                attached: outcome.attached,
              }),
            );
          case 'failed':
            return errorResult(T.runFailed(outcome.detail.run_id, outcome.detail.error));
          case 'cancelled':
            return errorResult(T.runCancelled(outcome.detail.run_id));
          case 'running':
            return okText(
              runningAnswer(
                outcome.runId,
                outcome.agentName,
                T.runningNextFromRun(opts.runWaitSec, outcome.runId),
              ),
            );
        }
      } catch (err) {
        return toToolError(err, opts.apiUrl);
      }
    },
  );
}
