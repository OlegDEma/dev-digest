import type { ChatMessage } from '@devdigest/shared';
import {
  BRIEF_INPUT_BUDGET,
  MAX_BLAST_CALLERS,
  MAX_BODY_TOKENS,
  MAX_ISSUE_TOKENS,
  MAX_RANGED_FILES,
  MAX_TITLE_TOKENS,
} from './constants.js';
import {
  BRIEF_SYSTEM_PROMPT,
  renderBlast,
  renderBody,
  renderFiles,
  renderIntent,
  renderIssue,
  renderSpec,
  renderTitle,
} from './prompt.js';
import type { BriefFacts, BriefSection, CountTokens } from './types.js';

const TRUNCATION_MARKER = '\n[… truncated by DevDigest]';

/** Cut `text` to at most `max` tokens (binary search on chars) and mark the cut. */
export function truncateToTokens(text: string, max: number, count: CountTokens): string {
  if (count(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(text.slice(0, mid) + TRUNCATION_MARKER) <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + TRUNCATION_MARKER;
}

export interface AssembledBrief {
  messages: ChatMessage[];
  sections: BriefSection[];
  inputTokens: number;
  reductions: string[];
  specsUsed: { path: string; tokens: number }[];
  specsOverBudget: string[];
}

interface Core {
  title: string;
  body: string | null;
  issue: BriefFacts['issue'];
  intent: BriefFacts['intent'];
  callers: { name: string; file: string; line: number }[];
  keep: number; // files kept (by churn rank)
  rangedFiles: number;
}

const churn = (f: BriefFacts['files'][number]) => f.additions + f.deletions;

/**
 * Q-2 reduction order: truncate body, issue, callers, ranges beyond the top files,
 * drop lowest-churn files, then (only if the core alone is still over) shed
 * callers / issue / intent / body; finally whole spec docs in order until the budget.
 * Budget counts system + user text.
 */
export function assembleBriefPrompt(
  facts: BriefFacts,
  count: CountTokens,
  budget: number = BRIEF_INPUT_BUDGET,
): AssembledBrief {
  const reductions: string[] = [];
  const systemTokens = count(BRIEF_SYSTEM_PROMPT);

  const title = truncateToTokens(facts.title, MAX_TITLE_TOKENS, count);
  if (title !== facts.title) reductions.push(`title truncated to ${MAX_TITLE_TOKENS} tokens`);

  let body = facts.body && facts.body.trim() ? facts.body : null;
  if (body) {
    const cut = truncateToTokens(body, MAX_BODY_TOKENS, count);
    if (cut !== body) reductions.push(`PR description truncated to ${MAX_BODY_TOKENS} tokens`);
    body = cut;
  }

  let issue = facts.issue;
  let issueText: string | undefined;
  if (issue) {
    const full = `${issue.title}\n\n${issue.body}`;
    issueText = truncateToTokens(full, MAX_ISSUE_TOKENS, count);
    if (issueText !== full) reductions.push(`linked issue truncated to ${MAX_ISSUE_TOKENS} tokens`);
  }

  let callers = facts.blast?.callers ?? [];
  if (callers.length > MAX_BLAST_CALLERS) {
    reductions.push(`blast callers cut to ${MAX_BLAST_CALLERS} of ${callers.length}`);
    callers = callers.slice(0, MAX_BLAST_CALLERS);
  }

  // Rank files by churn (desc), path asc as tiebreak — a stable, deterministic order.
  const ranked = [...facts.files].sort((a, b) => churn(b) - churn(a) || a.path.localeCompare(b.path));
  const rangedFiles = Math.min(MAX_RANGED_FILES, ranked.length);
  if (ranked.length > MAX_RANGED_FILES) {
    reductions.push(`hunk ranges kept for ${MAX_RANGED_FILES} of ${ranked.length} files`);
  }

  const build = (c: Core): { sections: BriefSection[]; total: number } => {
    const kept = new Set(ranked.slice(0, c.keep).map((f) => f.path));
    const ranged = new Set(ranked.slice(0, Math.min(c.keep, c.rangedFiles)).map((f) => f.path));
    const files = facts.files.filter((f) => kept.has(f.path));
    const raw: { name: BriefSection['name']; text: string }[] = [{ name: 'title', text: renderTitle(c.title) }];
    if (c.body) raw.push({ name: 'body', text: renderBody(c.body) });
    if (c.issue) raw.push({ name: 'issue', text: renderIssue(c.issue, issueText) });
    if (c.intent) raw.push({ name: 'intent', text: renderIntent(c.intent) });
    if (facts.blast) {
      raw.push({ name: 'blast', text: renderBlast({ summary: facts.blast.summary, callers: c.callers }) });
    }
    raw.push({ name: 'files', text: renderFiles(files, ranged) });
    const sections = raw.map((s) => ({ ...s, tokens: count(s.text) }));
    const total = systemTokens + count(sections.map((s) => s.text).join('\n\n'));
    return { sections, total };
  };

  const core: Core = { title, body, issue, intent: facts.intent, callers, keep: ranked.length, rangedFiles };
  let built = build(core);

  if (built.total > budget) {
    // Largest keep count whose assembly fits (monotone in keep) — binary search.
    let lo = 0;
    let hi = core.keep;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (build({ ...core, keep: mid }).total <= budget) lo = mid;
      else hi = mid - 1;
    }
    if (lo < ranked.length) reductions.push(`${ranked.length - lo} files omitted (lowest churn first)`);
    core.keep = lo;
    built = build(core);
  }

  // Core still over with no files: shed the remaining optional facts in order.
  const shed: [string, () => void][] = [
    ['blast callers omitted', () => (core.callers = [])],
    ['linked issue omitted', () => (core.issue = null)],
    ['derived intent omitted', () => (core.intent = null)],
    ['PR description omitted', () => (core.body = null)],
  ];
  for (const [label, apply] of shed) {
    if (built.total <= budget) break;
    apply();
    reductions.push(label);
    built = build(core);
  }

  // Specs: whole documents, in order, while they fit; the rest are over budget.
  const specsUsed: { path: string; tokens: number }[] = [];
  const specsOverBudget: string[] = [];
  const specTexts: string[] = [];
  let total = built.total;
  for (const s of facts.specs) {
    const text = renderSpec(s.path, s.text);
    const tokens = count(text);
    const next = total + tokens + 1;
    if (specsOverBudget.length === 0 && next <= budget) {
      specTexts.push(text);
      specsUsed.push({ path: s.path, tokens });
      total = next;
    } else {
      specsOverBudget.push(s.path);
    }
  }
  if (specsOverBudget.length > 0) reductions.push(`${specsOverBudget.length} spec documents over budget`);

  const sections = [...built.sections];
  const userCore = sections.map((s) => s.text).join('\n\n');
  let userText = specTexts.length ? `${userCore}\n\n${specTexts.join('\n\n')}` : userCore;
  // Token counts of parts need not add up exactly to the whole: drop trailing specs until the real total fits.
  while (specsUsed.length > 0 && systemTokens + count(userText) > budget) {
    const dropped = specsUsed.pop()!;
    specTexts.pop();
    specsOverBudget.unshift(dropped.path);
    userText = specTexts.length ? `${userCore}\n\n${specTexts.join('\n\n')}` : userCore;
  }
  if (specTexts.length) {
    const text = specTexts.join('\n\n');
    sections.push({ name: 'specs', text, tokens: count(text) });
  }

  return {
    messages: [
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    sections: [{ name: 'system', text: BRIEF_SYSTEM_PROMPT, tokens: systemTokens }, ...sections],
    inputTokens: systemTokens + count(userText),
    reductions,
    specsUsed,
    specsOverBudget,
  };
}
