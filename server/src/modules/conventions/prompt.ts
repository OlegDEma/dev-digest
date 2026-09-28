import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';
import { MAX_CANDIDATES } from './constants.js';

/**
 * The single model call of the extractor: propose house rules, each cited to a
 * file and a line in the sample it was given.
 *
 * FIELD ORDER IS LOAD-BEARING. Field order is generation order, so a model that
 * writes `category` first commits to a label before it knows what it is about to
 * say — it then bends the rule to fit the label and reports a flat confidence.
 * Everything it must OBSERVE therefore precedes everything it must JUDGE:
 *
 *   rule → evidence → probe_literal → occurrences_seen → rationale → category → confidence
 *
 * See specs/04-conventions.md §5.2.
 */
export const ExtractionSchema = z.object({
  candidates: z
    .array(
      z.object({
        rule: z.string().describe('The house rule, as an imperative a reviewer could enforce.'),
        evidence_path: z.string().describe('Path of a sampled file, exactly as shown in the sample header.'),
        evidence_line: z.number().int().describe('1-based line number from the gutter where the rule is visible.'),
        evidence_snippet: z
          .string()
          .describe('The exact code at that line, copied verbatim from the sample. Never paraphrase.'),
        probe_literal: z
          .string()
          .describe(
            'VERBATIM code text that appears wherever this rule is followed, e.g. ' +
              '"export const s = {" or "getContext(app.container". Copy it from the code. ' +
              'NOT a description, NOT the category name.',
          ),
        occurrences_seen: z
          .number()
          .int()
          .describe('How many DIFFERENT sampled files you personally saw this pattern in.'),
        rationale: z.string().describe('One sentence on what a reviewer should flag when this rule is broken.'),
        category: ConventionCategory,
        confidence: z.number().min(0).max(1).describe('0.9+ only if seen in many files and unambiguous.'),
      }),
    )
    .max(MAX_CANDIDATES),
});
export type ExtractionResponse = z.infer<typeof ExtractionSchema>;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/**
 * The system prompt. It spends most of its length on what NOT to return,
 * because the failure mode of this task is not missing rules — it is a list of
 * plausible-sounding generic advice that no reviewer would act on.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You extract the HOUSE RULES a specific codebase already follows, from a sample of its files.

You are given configuration files and source files. Every file is rendered with a 1-based line-number gutter.

A house rule is a convention THIS repository chose, that a new contributor could get wrong and a reviewer would ask them to change. It must be visible in the sample.

DO return rules like:
- "Co-located styles live in a \`styles.ts\` exporting a single object named \`s\`."
- "Repository classes take \`private db: Db\` and are the only layer importing drizzle."
- "Route handlers resolve tenancy with \`getContext(container, req)\` before anything else."
- "Test files mock the hooks module, never \`fetch\`."

DO NOT return:
- Universal advice that is true of every codebase ("use meaningful variable names", "handle errors", "write tests").
- Requirements of a framework or language rather than choices by this repo ("React components return JSX", "async functions return promises", "TypeScript files have types").
- Anything whose evidence is a single trivial line — a closing brace, an import of a well-known package, a bare \`export default\`.
- A rule you cannot point at a specific line for.

EVIDENCE RULES — these are enforced by code after you answer:
- \`evidence_path\` MUST be one of the sampled paths, spelled exactly as in its header.
- \`evidence_snippet\` MUST be copied CHARACTER FOR CHARACTER from that file in the sample. It is checked against the real file. If it is not found there, your candidate is DISCARDED — a paraphrase costs you the whole finding.
- \`evidence_line\` should match the gutter, but a small miscount is tolerated and corrected.
- Prefer a snippet of one to three meaningful lines.

PROBE_LITERAL — read this twice, it is the field most often filled in wrongly:
- It is a fragment of ACTUAL CODE, copied from the sample, that a plain-text search would find in every file following the rule.
- It is NOT a description of the rule, NOT the category name, NOT prose.
- Keep it short and distinctive: the shared part of the pattern, without the parts that vary.
- Good: \`getContext(app.container\`, \`export const s = {\`, \`private db: Db\`, \`throw new NotFoundError\`.
- Bad: \`structure\`, \`naming convention\`, \`uses async/await\`, \`see above\`.

CONFIDENCE:
- 0.90-1.00 — the pattern holds in many sampled files with no exception you saw.
- 0.70-0.89 — clear and repeated, but you saw only a few instances.
- 0.50-0.69 — plausible; you saw it once or twice, or there are exceptions.
- Below 0.50 — do not return it at all.

CATEGORIES: naming, imports, error-handling, testing, structure, typing, async, styling.

Return at most ${MAX_CANDIDATES} candidates, strongest first. Returning three well-grounded rules is a better answer than twelve weak ones.`;

/** The user message: just the rendered sample, clearly fenced. */
export function buildExtractionUserMessage(repoLabel: string, sample: string): string {
  return `Repository: ${repoLabel}

Below is a sample of its files. Extract the house rules it already follows.

${sample}`;
}
