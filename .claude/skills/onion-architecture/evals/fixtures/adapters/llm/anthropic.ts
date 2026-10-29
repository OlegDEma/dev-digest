import Anthropic from '@anthropic-ai/sdk';
import type { CompletionRequest, CompletionResult, LLMProvider } from '../../contracts/ports.js';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      system: system || undefined,
      messages: req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });
    const block = res.content[0];
    return {
      text: block && block.type === 'text' ? block.text : '',
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      costUsd: 0,
    };
  }
}
