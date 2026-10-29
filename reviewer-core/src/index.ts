/**
 * @devdigest/reviewer-core — the review engine.
 *
 * Pure review logic shared by the server (local reviews in the studio) and the
 * agent-runner (CI). NO database, GitHub, or filesystem access; the only side
 * effect is an LLM call through an INJECTED LLMProvider (so it is mock-testable).
 *
 * Consumers wire it via a tsconfig path alias (`@devdigest/reviewer-core` →
 * `../reviewer-core/src`) and consume the TypeScript source directly (tsx in
 * dev, vitest in tests, @vercel/ncc bundle in the runner). The package itself
 * never emits JS — its `build` is a type-check.
 */

// Prompt assembly + prompt-injection hardening.
export {
  assemblePrompt,
  wrapUntrusted,
  renderIntentBlock,
  sanitizeSourceLabel,
  renderProjectContextDoc,
  type ProjectContextDocInput,
  type PromptParts,
  type AssembledPrompt,
  type ReviewPromptSection,
  type ReviewPromptSectionName,
} from './prompt.js';

// Intent classifier (pure half — source collection lives in the server).
export {
  classifyIntent,
  renderFileList,
  buildIntentMessages,
  adjustIntent,
  MAX_INTENT_SOURCE_CHARS,
  truncateForIntent,
  MAX_INTENT_BODY_CHARS,
  type IntentSourceInput,
  type ClassifyIntentInput,
  type ClassifyIntentResult,
  type IntentPromptSection,
} from './intent/classify.js';

// PR brief (pure half — input collection, locking and storage live in the server).
export { generateBrief, type GenerateBriefInput, type GenerateBriefResult } from './brief/generate.js';
export { assembleBriefPrompt, truncateToTokens, type AssembledBrief } from './brief/budget.js';
export { validateBriefOutput, refPath, type BriefValidation, type BriefValidationFacts } from './brief/validate.js';
export { BRIEF_SYSTEM_PROMPT } from './brief/prompt.js';
export {
  BRIEF_INPUT_BUDGET,
  BRIEF_MAX_OUTPUT_TOKENS,
  BRIEF_SCHEMA_NAME,
  MAX_RISKS as BRIEF_MAX_RISKS,
  MAX_FOCUS as BRIEF_MAX_FOCUS,
} from './brief/constants.js';
export type { BriefFacts, BriefRange, BriefSection, CountTokens } from './brief/types.js';

// Citation grounding — the mandatory mechanical gate for diff findings.
export { groundFindings, groundingSummary, type GroundingResult } from './grounding.js';

// Structured-output helpers (Zod → JSON Schema + parse-with-repair).
export {
  toJsonSchema,
  extractJson,
  parseWithRepair,
  type JsonSchema,
  type ParseResult,
} from './llm/structured.js';

// Map-reduce helpers (reduce partials, slice a file's diff).
export { formatSkillBlock } from './review/skills.js';
export { reduceReviews, sliceDiff, capOutOfScopeFindings } from './review/reduce.js';

// The engine entry point: given (diff + resolved agent inputs + LLM) → grounded Review.
export {
  reviewPullRequest,
  DEFAULT_MAP_THRESHOLD_LINES,
  DEFAULT_REVIEW_MAX_RETRIES,
  type ReviewInput,
  type ReviewOutcome,
  type ReviewEvent,
  type ReviewStrategy,
  type ReviewMode,
  type PromptAssembledEvent,
} from './review/run.js';

// Output: grounded Review → GitHubReviewPayload (body + inline comments + event).
export {
  toReviewPayload,
  gateTriggered,
  countBlockers,
  type ToReviewOptions,
} from './output/to-review.js';

// The single OpenAI-compatible structured provider (OpenRouter), shared by the
// CI runner and the server's openrouter path. Owns session grouping + guards.
export { OpenRouterProvider, type OpenRouterProviderOptions } from './llm/openrouter.js';
