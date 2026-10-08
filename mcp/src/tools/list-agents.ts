import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import { toToolError } from '../errors.js';
import { agentsAnswer } from '../format.js';
import { TOOL_TEXTS } from '../texts.js';
import { okText, READ_ONLY, type ToolOpts } from './types.js';

export function register(server: McpServer, api: DevDigestApi, opts: ToolOpts): void {
  server.registerTool(
    'list_agents',
    {
      title: TOOL_TEXTS.list_agents.title,
      description: TOOL_TEXTS.list_agents.description,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return okText(agentsAnswer(await api.listAgents()));
      } catch (err) {
        return toToolError(err, opts.apiUrl);
      }
    },
  );
}
