import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { isStructuredOutputError, StructuredOutputError } from '@devdigest/shared';

const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

const Schema = z.object({ answer: z.string() });
const req = {
  model: 'gpt-4o',
  schema: Schema,
  schemaName: 'Thing',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('LLM adapters exhausted retries', () => {
  it('OpenAI: attempts 3, summed tokens, guard by name, no raw output', async () => {
    openaiCreate.mockReset();
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'RAW-SENTINEL' } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    });
    const err = await new OpenAIProvider('k').completeStructured(req).catch((e) => e);
    expect(openaiCreate).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(StructuredOutputError);
    expect(isStructuredOutputError(err)).toBe(true);
    expect(err).toMatchObject({ attempts: 3, tokensIn: 21, tokensOut: 9 });
    expect(JSON.stringify(err) + err.message).not.toContain('RAW-SENTINEL');
  });

  it('Anthropic: attempts 3, summed tokens', async () => {
    anthropicCreate.mockReset();
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 't', name: 'x', input: { wrong: 1 } }],
      usage: { input_tokens: 5, output_tokens: 2 },
    });
    const err = await new AnthropicProvider('k')
      .completeStructured({ ...req, model: 'claude-sonnet-4-5' })
      .catch((e) => e);
    expect(anthropicCreate).toHaveBeenCalledTimes(3);
    expect(isStructuredOutputError(err)).toBe(true);
    expect(err).toMatchObject({ attempts: 3, tokensIn: 15, tokensOut: 6 });
  });

  it('isStructuredOutputError matches by name across instances and rejects others', () => {
    const fake = Object.assign(new Error('x'), { name: 'StructuredOutputError' });
    expect(isStructuredOutputError(fake)).toBe(true);
    expect(isStructuredOutputError(new Error('x'))).toBe(false);
    expect(isStructuredOutputError('x')).toBe(false);
  });
});
