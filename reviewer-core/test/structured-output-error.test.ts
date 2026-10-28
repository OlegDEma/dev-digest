import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { isStructuredOutputError, StructuredOutputError } from '@devdigest/shared';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { OpenRouterProvider } from '../src/llm/openrouter.js';

const Schema = z.object({ answer: z.string() });

describe('OpenRouterProvider exhausted retries', () => {
  it('throws StructuredOutputError with attempts 3 and summed tokens/cost', async () => {
    create.mockReset();
    create.mockResolvedValue({
      choices: [{ message: { content: 'not json' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.01 },
    });
    const p = new OpenRouterProvider('k');
    const err = await p
      .completeStructured({
        model: 'm',
        schema: Schema,
        schemaName: 'Thing',
        messages: [{ role: 'user', content: 'hi' }],
      })
      .catch((e) => e);
    expect(create).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(StructuredOutputError);
    expect(isStructuredOutputError(err)).toBe(true);
    expect(err).toMatchObject({ attempts: 3, tokensIn: 30, tokensOut: 15, schemaName: 'Thing', statusCode: 502 });
    expect(err.costUsd).toBeCloseTo(0.03);
    expect(JSON.stringify(err)).not.toContain('not json');
  });

  it('falls back to the injected estimator and keeps the caller retry count', async () => {
    create.mockReset();
    create.mockResolvedValue({
      choices: [{ message: { content: '{"nope":1}' } }],
      usage: { prompt_tokens: 4, completion_tokens: 2 },
    });
    const p = new OpenRouterProvider('k', { estimateCost: () => 0.5 });
    const err = await p
      .completeStructured({
        model: 'm',
        schema: Schema,
        schemaName: 'Thing',
        maxRetries: 0,
        messages: [{ role: 'user', content: 'hi' }],
      })
      .catch((e) => e);
    expect(create).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ attempts: 1, tokensIn: 4, tokensOut: 2, costUsd: 0.5 });
  });
});
