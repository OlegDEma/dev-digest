import { describe, it, expect } from 'vitest';
import type { EvalConfigSnapshot, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { EVAL_INPUT_LIMITS } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { EvalRunExecutor, PR_DESCRIPTION_PROMPT_CHARS } from '../src/modules/evals/executor.js';

class CapturingLLM extends MockLLMProvider {
  prompts: string[] = [];
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.prompts.push(JSON.stringify(req.messages));
    const review = { verdict: 'comment', summary: 's', score: 80, findings: [] };
    return { data: review as unknown as T, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '{}', attempts: 1 };
  }
}

const SNAPSHOT: EvalConfigSnapshot = {
  agent_version: 1,
  config_id: 'c',
  provider: 'openai',
  model: 'm',
  system_prompt: 'sys',
  strategy: 'single-pass',
  skills: [],
};
const DIFF = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n';

async function runWith(title: string, description: string) {
  const llm = new CapturingLLM();
  await new EvalRunExecutor().run({
    runId: 'r',
    agentId: 'a',
    snapshot: SNAPSHOT,
    skillBlocks: [],
    cases: [{ id: 'c', name: 'n', inputDiff: DIFF, inputFiles: [], prMeta: { title, description }, revision: 1, expected: [] }],
    llm,
    sink: { insertCaseResult: async () => {}, finishRun: async () => {} },
    log: { info: () => {}, warn: () => {} },
  });
  return llm.prompts.join('\n');
}

describe('eval executor PR description cap', () => {
  it('a max-length title and description reach the prompt intact', async () => {
    const title = 'T'.repeat(EVAL_INPUT_LIMITS.prTitleChars);
    const description = 'D'.repeat(EVAL_INPUT_LIMITS.prDescriptionChars - 3) + 'END';
    expect(PR_DESCRIPTION_PROMPT_CHARS).toBe(7 + 200 + 2 + 8000);
    const prompt = await runWith(title, description);
    expect(prompt).toContain(`Title: ${title}`);
    expect(prompt).toContain('D'.repeat(100) + 'END');
  });
});
