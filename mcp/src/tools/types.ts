import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolOpts {
  apiUrl: string;
  runWaitSec: number;
  pollMs: number;
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const okText = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });
