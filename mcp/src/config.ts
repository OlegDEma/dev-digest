import { log } from './log.js';

export const POLL_MS = 5000;
export const DEFAULT_API_URL = 'http://localhost:3001';
export const DEFAULT_WAIT_SEC = 120;
export const MAX_WAIT_SEC = 900;

export interface Config {
  apiUrl: string;
  runWaitSec: number;
}

/** Parse `DEVDIGEST_MCP_RUN_WAIT_SEC`: unset/garbage → 120, otherwise clamped to 0–900. */
function parseWaitSec(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_WAIT_SEC;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    log('warn', 'DEVDIGEST_MCP_RUN_WAIT_SEC is not a number; using the default', { value: raw });
    return DEFAULT_WAIT_SEC;
  }
  return Math.min(MAX_WAIT_SEC, Math.max(0, Math.floor(n)));
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const apiUrl = (env['DEVDIGEST_API_URL']?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  return { apiUrl, runWaitSec: parseWaitSec(env['DEVDIGEST_MCP_RUN_WAIT_SEC']) };
}
