import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestApi } from '../api/port.js';
import { toToolError } from '../errors.js';
import { blastAnswer } from '../format.js';
import { resolvePr, resolveRepo } from '../resolve.js';
import * as T from '../texts.js';
import { READ_ONLY, okText, type ToolOpts } from './types.js';

// Thin rim over GET /pulls/:id/blast: the same map the studio shows (spec 12, D13).
export function register(server: McpServer, api: DevDigestApi, opts: ToolOpts): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: T.TOOL_TEXTS.get_blast_radius.title,
      description: T.TOOL_TEXTS.get_blast_radius.description,
      inputSchema: {
        repo: z.string().describe(T.DESCRIBE.repo),
        pr: z.number().int().positive().describe(T.DESCRIBE.pr),
      },
      annotations: READ_ONLY,
    },
    async ({ repo, pr }) => {
      try {
        const repoRow = await resolveRepo(api, repo);
        const pull = await resolvePr(api, repoRow, pr, 'get_blast_radius');
        const data = await api.getBlast(pull.id);
        return okText(blastAnswer(repoRow.full_name, pr, data));
      } catch (err) {
        return toToolError(err, opts.apiUrl);
      }
    },
  );
}
