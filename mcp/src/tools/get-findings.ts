import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestApi } from '../api/port.js';
import { ApiError, errorResult, toToolError } from '../errors.js';
import { reviewAnswer, runningAnswer } from '../format.js';
import { fetchRun } from '../run-review.js';
import * as T from '../texts.js';
import { okText, READ_ONLY, type ToolOpts } from './types.js';

export function register(server: McpServer, api: DevDigestApi, opts: ToolOpts): void {
  server.registerTool(
    'get_findings',
    {
      title: T.TOOL_TEXTS.get_findings.title,
      description: T.TOOL_TEXTS.get_findings.description,
      inputSchema: {
        run_id: z.string().uuid().describe(T.DESCRIBE.runId),
        limit: z.number().int().min(1).max(100).default(20).describe(T.DESCRIBE.limit),
        offset: z.number().int().min(0).default(0),
        detail: z.enum(['brief', 'full']).default('brief').describe(T.DESCRIBE.detail),
      },
      annotations: READ_ONLY,
    },
    async ({ run_id, limit, offset, detail }, extra) => {
      try {
        const run = await fetchRun(api, run_id, extra.signal);
        switch (run.status) {
          case 'running':
            return okText(runningAnswer(run.run_id, run.agent_name, T.RUNNING_NEXT_FROM_GET));
          case 'done':
            return okText(reviewAnswer(run, { limit, offset, detail }));
          case 'cancelled':
            return errorResult(T.runCancelled(run.run_id));
          default:
            return errorResult(T.runFailed(run.run_id, run.error));
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return errorResult(T.runNotFound(run_id));
        }
        return toToolError(err, opts.apiUrl);
      }
    },
  );
}
