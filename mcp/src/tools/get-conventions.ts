import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ConventionStatus } from '@devdigest/shared';
import { z } from 'zod';
import type { DevDigestApi } from '../api/port.js';
import { toToolError } from '../errors.js';
import { conventionsAnswer } from '../format.js';
import { resolveRepo } from '../resolve.js';
import * as T from '../texts.js';
import { okText, READ_ONLY, type ToolOpts } from './types.js';

const STATUS_FILTER = ['accepted', 'pending', 'rejected', 'all'] as const;

// tsc fails here when ConventionStatus gains or loses a member.
type Listed = Exclude<(typeof STATUS_FILTER)[number], 'all'>;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _statusInSync: Equal<Listed, ConventionStatus> = true;
void _statusInSync;

export function register(server: McpServer, api: DevDigestApi, opts: ToolOpts): void {
  server.registerTool(
    'get_conventions',
    {
      title: T.TOOL_TEXTS.get_conventions.title,
      description: T.TOOL_TEXTS.get_conventions.description,
      inputSchema: {
        repo: z.string().describe(T.DESCRIBE.repo),
        status: z.enum(STATUS_FILTER).default('accepted'),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: READ_ONLY,
    },
    async ({ repo, status, limit }) => {
      try {
        const repoRow = await resolveRepo(api, repo);
        const all = await api.listConventions(repoRow.id);
        const filtered = status === 'all' ? all : all.filter((c) => c.status === status);
        return okText(conventionsAnswer(repoRow.full_name, status, filtered, limit));
      } catch (err) {
        return toToolError(err, opts.apiUrl);
      }
    },
  );
}

