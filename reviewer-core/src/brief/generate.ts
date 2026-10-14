import { BriefModelOutput } from '@devdigest/shared';
import type { BriefDropped, LLMProvider, ReviewFocusItem, Risk } from '@devdigest/shared';
import { assembleBriefPrompt } from './budget.js';
import { BRIEF_MAX_OUTPUT_TOKENS, BRIEF_SCHEMA_NAME } from './constants.js';
import type { BriefFacts, BriefSection, CountTokens } from './types.js';
import { validateBriefOutput } from './validate.js';

export interface GenerateBriefInput {
  llm: LLMProvider;
  model: string;
  facts: BriefFacts;
  count: CountTokens;
  sessionId?: string;
  /** Called with the prompt composition right before the single LLM call (for logging). */
  onPrompt?: (p: { sections: BriefSection[] }) => void;
}

export interface GenerateBriefResult {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  dropped: BriefDropped;
  corrected_lines: number;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  model: string;
  inputTokens: number;
  sections: BriefSection[];
  reductions: string[];
  specsUsed: { path: string; tokens: number }[];
  specsOverBudget: string[];
}

/** Pure half of the PR brief: assemble within budget → ONE structured call → validate. Errors propagate unchanged. */
export async function generateBrief(input: GenerateBriefInput): Promise<GenerateBriefResult> {
  const assembled = assembleBriefPrompt(input.facts, input.count);
  input.onPrompt?.({ sections: assembled.sections });

  const res = await input.llm.completeStructured<BriefModelOutput>({
    model: input.model,
    schema: BriefModelOutput,
    schemaName: BRIEF_SCHEMA_NAME,
    messages: assembled.messages,
    maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
    requireParameters: true,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  const changedRanges = new Map(input.facts.files.map((f) => [f.path, f.ranges] as const));
  const callerLines = new Map<string, number[]>();
  for (const c of input.facts.blast?.callers ?? []) {
    const arr = callerLines.get(c.file);
    if (arr) arr.push(c.line);
    else callerLines.set(c.file, [c.line]);
  }
  const v = validateBriefOutput(res.data, { changedRanges, callerLines });

  return {
    summary: res.data.summary,
    risks: v.risks,
    review_focus: v.review_focus,
    dropped: v.dropped,
    corrected_lines: v.corrected_lines,
    attempts: res.attempts,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    model: input.model,
    inputTokens: assembled.inputTokens,
    sections: assembled.sections,
    reductions: assembled.reductions,
    specsUsed: assembled.specsUsed,
    specsOverBudget: assembled.specsOverBudget,
  };
}
