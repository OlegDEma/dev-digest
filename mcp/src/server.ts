import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './api/port.js';
import { INSTRUCTIONS } from './texts.js';
import { register as registerBlastRadius } from './tools/get-blast-radius.js';
import { register as registerConventions } from './tools/get-conventions.js';
import { register as registerFindings } from './tools/get-findings.js';
import { register as registerListAgents } from './tools/list-agents.js';
import { register as registerRun } from './tools/run-agent-on-pr.js';
import type { ToolOpts } from './tools/types.js';

const VERSION = '0.0.0';

/** Registers the five tools in the fixed D13 order. */
export function createServer(api: DevDigestApi, opts: ToolOpts): McpServer {
  const server = new McpServer({ name: 'devdigest', version: VERSION }, { instructions: INSTRUCTIONS });
  registerListAgents(server, api, opts);
  registerRun(server, api, opts);
  registerFindings(server, api, opts);
  registerConventions(server, api, opts);
  registerBlastRadius(server, api, opts);
  return server;
}
