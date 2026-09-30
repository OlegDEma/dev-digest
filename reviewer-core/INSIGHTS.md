# reviewer-core — insights

Durable findings about `reviewer-core/` that aren't visible in the code —
recorded by the `engineering-insights` skill (append-only; correct a stale entry
with a dated note beneath it, don't edit it away). Cross-package findings live in
the root [`../INSIGHTS.md`](../INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## Decisions

## What Works

- **2026-09-30** — Mark every truncation you feed an LLM. The intent classifier cut PR bodies and linked docs with a bare `slice`, and the model then reported them in `missing_context` as "description ends at an incomplete heading" (it read the cut as the author's text). `truncateForIntent(text, max)` appends `[truncated by DevDigest: showing the first N of M characters]` and is idempotent, so server pre-truncation and reviewer-core capping don't double-cut. Evidence: `src/intent/classify.ts:78`; before/after `missing_context` on dev-digest PR #218.

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-09-30** — OpenRouter `provider: { require_parameters: true }` routes only to providers that support **every** param in the request, not just `response_format`. The adapter used to always send `temperature: 0`; reasoning models without `temperature` (e.g. `openai/gpt-6-luna`, check `supported_parameters` in `GET https://openrouter.ai/api/v1/models`) then fail with `404 No endpoints found that can handle the requested parameters`. When `requireParameters` is set the adapter now sends `temperature` only if the caller passed one. Related: omitting `max_tokens` makes OpenRouter reserve the model's full output window (65 536 for gpt-6-luna) against credits → `402 … can only afford N`. Always pass a small `maxTokens` for short structured calls (`MAX_INTENT_OUTPUT_TOKENS = 4000`, which leaves room for reasoning tokens). Evidence: `src/llm/openrouter.ts:72-77,89`, `src/intent/classify.ts:13,199`; live `POST /pulls/:id/intent` 404 → 402 → 200.

## Recurring Errors & Fixes

## Open Questions
