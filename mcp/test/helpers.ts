import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { ToolOpts } from '../src/tools/types.js';
import type { FakeApi } from './fake-api.js';

export const OPTS: ToolOpts = { apiUrl: 'http://api.test', runWaitSec: 60, pollMs: 5 };

export async function connect(api: FakeApi, opts: Partial<ToolOpts> = {}) {
  const server = createServer(api, { ...OPTS, ...opts });
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, server };
}

type Content = { type: string; text?: string }[];

export function textOf(result: unknown): string {
  const content = (result as { content: Content }).content;
  const first = content[0];
  if (!first || first.type !== 'text' || first.text === undefined) throw new Error('no text block');
  return first.text;
}

export const jsonOf = (result: unknown): Record<string, any> => JSON.parse(textOf(result));
