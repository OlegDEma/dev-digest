import type { BlastRadius, BriefMissingInput, BriefSpecEntry, Intent, PrBlastResponse, UnifiedDiff } from '@devdigest/shared';
import type { BriefFacts } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { PinoLike } from '../../platform/run-logger.js';
import type { RepoRow } from '../../db/rows.js';
import type { PullRow, ReviewRepository } from '../reviews/repository.js';
import { loadDiff } from '../reviews/diff-loader.js';
import type { IntentRepository } from '../intent/repository.js';
import { extractReferences } from '../intent/helpers.js';
import { resolveProjectContext } from '../project-context/resolve.js';
import { MISSING, SMART_DIFF_UNAVAILABLE } from './constants.js';
import {
  callersFromBlast,
  fileFacts,
  orderSpecUnion,
  toBlastSnapshot,
  toIntentSnapshot,
} from './helpers.js';
import type { SpecAttachmentRow } from './repository.js';

export interface BriefInputs {
  facts: BriefFacts;
  missing: BriefMissingInput[];
  specEntries: BriefSpecEntry[];
  intentSnapshot: Intent | null;
  blastSnapshot: BlastRadius | null;
}

/** Attach lists as read at the start of a generation; a failed read is carried as its message. */
export type SpecAttachments = { rows: SpecAttachmentRow[] } | { error: string };

export interface BriefInputDeps {
  reviews: ReviewRepository;
  intents: Pick<IntentRepository, 'get'>;
  blast: { get(workspaceId: string, prId: string, logger: Pick<PinoLike, 'info' | 'warn'>): Promise<PrBlastResponse> };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * Gather everything the brief may mention. Each source has its own try/catch: an
 * unavailable input becomes a `missing_inputs` entry and generation continues.
 * No model call, no intent derivation; I/O only via `container.*` and sibling services.
 */
export async function collectBriefInputs(
  container: Container,
  deps: BriefInputDeps,
  ctx: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRow;
    logger: Pick<PinoLike, 'info' | 'warn'>;
    attachments: SpecAttachments;
  },
): Promise<BriefInputs> {
  const { workspaceId, pull, repo, logger, attachments } = ctx;
  const missing: BriefMissingInput[] = [];

  // Intent (stored only)
  let intentSnapshot: Intent | null = null;
  try {
    const rec = await deps.intents.get(pull.id);
    if (rec) intentSnapshot = toIntentSnapshot(rec);
    else missing.push({ input: 'intent', reason: MISSING.intent });
  } catch (e) {
    missing.push({ input: 'intent', reason: errMsg(e) });
  }

  // Blast (stored index only)
  let blastSnapshot: BlastRadius | null = null;
  let blast: BriefFacts['blast'] = null;
  try {
    const b = await deps.blast.get(workspaceId, pull.id, logger);
    if (b.degraded) {
      missing.push({ input: 'blast', reason: `${MISSING.blastPrefix} (${b.reason ?? 'no_data'})` });
    } else {
      blastSnapshot = toBlastSnapshot(b);
      blast = { summary: b.summary, callers: callersFromBlast(b) };
    }
  } catch (e) {
    missing.push({ input: 'blast', reason: `${MISSING.blastPrefix} (${errMsg(e)})` });
  }

  // Files + hunk ranges
  let prFiles: Awaited<ReturnType<ReviewRepository['getPrFiles']>> = [];
  try {
    prFiles = await deps.reviews.getPrFiles(pull.id);
  } catch {
    prFiles = [];
  }
  let diff: UnifiedDiff | null = null;
  try {
    diff = await loadDiff(container, deps.reviews, workspaceId, pull, repo);
  } catch {
    diff = null;
  }
  const files = fileFacts(prFiles, diff);
  if (files.length === 0) {
    missing.push({ input: 'diff_stats', reason: MISSING.files });
    missing.push({ input: 'hunk_ranges', reason: MISSING.files });
  } else if (!files.some((f) => f.ranges.length > 0)) {
    missing.push({ input: 'hunk_ranges', reason: MISSING.files });
  }

  // PR body + linked issue
  const body = pull.body && pull.body.trim() ? pull.body : null;
  if (!body) missing.push({ input: 'pr_body', reason: MISSING.prBody });

  let issue: BriefFacts['issue'] = null;
  const refs = extractReferences(pull.body ?? '', { owner: repo.owner, name: repo.name });
  const sameRepo = refs.issues.find(
    (i) => i.owner.toLowerCase() === repo.owner.toLowerCase() && i.name.toLowerCase() === repo.name.toLowerCase(),
  );
  if (!sameRepo) {
    missing.push({
      input: 'linked_issue',
      reason: refs.issues.length > 0 ? MISSING.linkedIssueOtherRepo : MISSING.linkedIssueNone,
    });
  } else {
    try {
      const github = await container.github();
      const got = await github.getIssue({ owner: repo.owner, name: repo.name }, sameRepo.number);
      issue = { ref: `${repo.owner}/${repo.name}#${sameRepo.number}`, title: got.title, body: got.body ?? '' };
    } catch (e) {
      missing.push({ input: 'linked_issue', reason: errMsg(e) });
    }
  }

  // Specs attached to any agent or skill, read fresh from the clone
  let specEntries: BriefSpecEntry[] = [];
  let specs: BriefFacts['specs'] = [];
  try {
    if ('error' in attachments) throw new Error(attachments.error);
    const paths = orderSpecUnion(attachments.rows);
    if (paths.length === 0) {
      missing.push({ input: 'specs', reason: MISSING.specs });
    } else {
      const resolved = await resolveProjectContext({
        cloneRoot: repo.clonePath,
        repoFullName: repo.fullName,
        agentDocs: [],
        skillDocs: [paths],
        cloneDocs: container.cloneDocs,
        tokenizer: container.tokenizer,
      });
      specs = resolved.docs.map((d) => ({ path: d.path, text: d.text }));
      specEntries = resolved.specsDocs.map(
        (d): BriefSpecEntry =>
          d.status === 'injected'
            ? { path: d.path, status: 'used', reason: null, tokens: d.estimated_tokens }
            : { path: d.path, status: 'skipped', reason: d.reason, tokens: null },
      );
    }
  } catch (e) {
    missing.push({ input: 'specs', reason: errMsg(e) });
  }

  missing.push({ input: 'smart_diff', reason: SMART_DIFF_UNAVAILABLE });

  return {
    facts: { title: pull.title, body, issue, intent: intentSnapshot, blast, files, specs },
    missing,
    specEntries,
    intentSnapshot,
    blastSnapshot,
  };
}
