import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpDevDigestApi } from './api/http.js';
import { loadConfig, POLL_MS } from './config.js';
import { log } from './log.js';
import { createServer } from './server.js';

process.on('uncaughtException', (err) => log('error', 'uncaughtException', { message: err.message }));
process.on('unhandledRejection', (reason) =>
  log('error', 'unhandledRejection', { message: reason instanceof Error ? reason.message : String(reason) }),
);

const cfg = loadConfig();
const server = createServer(new HttpDevDigestApi(cfg.apiUrl), {
  apiUrl: cfg.apiUrl,
  runWaitSec: cfg.runWaitSec,
  pollMs: POLL_MS,
});
await server.connect(new StdioServerTransport());
log('info', 'devdigest-mcp ready', { apiUrl: cfg.apiUrl, runWaitSec: cfg.runWaitSec });
