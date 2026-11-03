import { OpenRouterProvider } from '@devdigest/reviewer-core';
import type { LLMProvider } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Only OpenRouter has an engine provider today; anything else is a clear exit 1. */
export function makeLlm(provider: string, env: NodeJS.ProcessEnv): LLMProvider {
  if (provider !== 'openrouter') {
    throw new RunnerError(`provider ${provider} is not supported in CI (only openrouter)`);
  }
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new RunnerError('OPENROUTER_API_KEY is not set');
  return new OpenRouterProvider(key);
}
