import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestApi } from '../api/port.js';
import { notImplementedAnswer } from '../format.js';
import * as T from '../texts.js';
import { READ_ONLY, okText, type ToolOpts } from './types.js';

// Stub (D27): non-error not_implemented answer, no API request. The input schema is final for the later implementation.
export function register(server: McpServer, _api: DevDigestApi, _opts: ToolOpts): void {
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
    async () => okText(notImplementedAnswer(T.BLAST_RADIUS_NEXT)),
  );
}
