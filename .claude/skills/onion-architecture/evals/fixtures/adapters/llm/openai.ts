import OpenAI from 'openai';
import type { CompletionRequest, CompletionResult, LLMProvider } from '../../contracts/ports.js';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await this.client.chat.completions.create({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: req.messages,
    });
    return {
      text: res.choices[0]?.message.content ?? '',
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      costUsd: 0,
    };
  }
}
