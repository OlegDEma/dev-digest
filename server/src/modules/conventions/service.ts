import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RepoIntelRepository } from '../repo-intel/repository.js';
import {
  CODE_SAMPLE_COUNT,
  CONFIG_SAMPLE_PATHS,
  DEFAULT_SKILL_NAME,
  EXTRACTION_TEMPERATURE,
  LAYERED_SAMPLE_COUNT,
  WALK_EXTENSIONS,
  WALK_IGNORE_DIRS,
  WALK_MAX_FILES,
} from './constants.js';
import {
  buildSkillBody,
  dedupeCandidates,
  escapeRegex,
  evidenceFilesOf,
  isUsableProbe,
  pickLayered,
  renderSample,
  toConventionDto,
  verifyCandidate,
  type SampledFile,
} from './helpers.js';
import {
  buildExtractionUserMessage,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionSchema,
} from './prompt.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';

/**
 * Conventions extractor — three stages, and only the middle one is a model:
 *
 *   SAMPLE   configs + repoIntel.getConventionSamples(), rendered with a 1-based
 *            line gutter. Pure code — the model never browses or picks files.
 *   PROPOSE  one structured call on the model from FEATURE_MODELS.conventions.
 *   VERIFY   re-read the cited file; an invented snippet is dropped, a wrong
 *            line number is corrected, and the snippet shown to the user is
 *            sliced from the file rather than taken from the model's reply.
 *
 * See specs/04-conventions.md.
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private intelRepo: RepoIntelRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.intelRepo = new RepoIntelRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { rule?: string; rationale?: string | null; category?: ConventionCandidate['category']; status?: ConventionCandidate['status'] },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule.trim() } : {}),
      ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });
    return row ? toConventionDto(row) : undefined;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.remove(workspaceId, id);
  }

  // ------------------------------------------------------------------- scan

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.intelRepo.getRepoBasics(repoId);
    if (!repo) throw new ValidationError('Repo not found');

    // ---- stage 1: SAMPLE (no model) ----
    const files = await this.sample(repoId, repo.clonePath);
    if (files.length === 0) {
      throw new ValidationError(
        'Nothing to sample — clone and index this repo first, then run the scan again.',
      );
    }
    const { text: sample, used } = renderSample(files);

    // ---- stage 2: PROPOSE (the only model call) ----
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const repoLabel = `${repo.owner}/${repo.name}`;
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ExtractionSchema,
      schemaName: EXTRACTION_SCHEMA_NAME,
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionUserMessage(repoLabel, sample) },
      ],
    });
    const proposed = result.data.candidates ?? [];

    // ---- stage 3: VERIFY (no model) ----
    type PendingRow = Omit<InsertConvention, 'workspaceId' | 'repoId'>;
    let droppedUngrounded = 0;
    const survivors: { rule: string; row: PendingRow; probe: string }[] = [];

    for (const c of proposed) {
      const gate = verifyCandidate(c, used);
      if (!gate.ok) {
        droppedUngrounded++;
        continue;
      }
      survivors.push({
        rule: c.rule,
        probe: c.probe_literal,
        row: {
          category: c.category,
          rule: c.rule.trim(),
          rationale: c.rationale?.trim() || null,
          evidencePath: gate.path,
          evidenceLine: gate.line,
          evidenceSnippet: gate.snippet,
          confidence: c.confidence,
          occurrences: null,
          status: 'pending',
        },
      });
    }

    // Dedupe against each other AND against rules the user already decided on,
    // so a re-scan never re-litigates an accepted or rejected rule.
    const decided = await this.repo.listByStatus(workspaceId, repoId, ['accepted', 'rejected']);
    const { kept, dropped: droppedDuplicate } = dedupeCandidates(
      survivors,
      decided.map((d) => d.rule),
    );

    // ---- frequency: the model proposes a probe, CODE counts it ----
    await this.countOccurrences(repo, kept);

    const rows = await this.repo.replacePending(
      workspaceId,
      repoId,
      kept.map((k) => k.row),
    );

    return {
      candidates: rows.map(toConventionDto),
      proposed: proposed.length,
      dropped_ungrounded: droppedUngrounded,
      dropped_duplicate: droppedDuplicate,
      sampled_files: used.length,
      model: result.model,
      cost_usd: result.costUsd,
    };
  }

  /**
   * Stage 1 — entirely code. Config files state a repo's rules; ranked source
   * files demonstrate them. The layered pass exists because the flat top-N is
   * usually all one layer (specs/04-conventions.md §5.1).
   */
  private async sample(repoId: string, clonePath: string | null): Promise<SampledFile[]> {
    if (!clonePath) return [];

    // The criterion's literal top-12, plus a layered pass that spans buckets
    // and (unlike the review-context sampler) keeps tests.
    const top = await this.container.repoIntel.getConventionSamples(repoId, CODE_SAMPLE_COUNT);
    const wide = await this.container.repoIntel.getConventionSamples(repoId, LAYERED_SAMPLE_COUNT, {
      includeTests: true,
    });

    // repo-intel returns nothing when the indexer is off or the repo was never
    // indexed. Falling back to a deterministic walk of the clone keeps the
    // feature usable on any cloned repo instead of dead — still pure code, so
    // the model continues to have no say in what it reads.
    const ranked = wide.length > 0 ? wide : await this.walkCodeFiles(clonePath);
    const layered = pickLayered(ranked.filter((p) => !top.includes(p)));

    const paths = [...CONFIG_SAMPLE_PATHS, ...top, ...layered];
    const out: SampledFile[] = [];
    const seen = new Set<string>();
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      const content = await readFile(join(clonePath, path), 'utf8').catch(() => null);
      if (content && content.trim()) out.push({ path, content });
    }
    return out;
  }


  /**
   * Deterministic breadth-first walk of the clone for code files — the fallback
   * when repo-intel has no rank to offer. Sorted so two scans of an unchanged
   * repo sample the same files.
   */
  private async walkCodeFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    const queue: string[] = [''];
    while (queue.length > 0 && out.length < WALK_MAX_FILES) {
      const rel = queue.shift()!;
      const entries = await readdir(join(root, rel), { withFileTypes: true }).catch(() => []);
      for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
        const child = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (e.name.startsWith('.') || (WALK_IGNORE_DIRS as readonly string[]).includes(e.name)) continue;
          queue.push(child);
        } else if ((WALK_EXTENSIONS as readonly string[]).some((x) => e.name.endsWith(x))) {
          if (!e.name.endsWith('.d.ts')) out.push(child);
        }
      }
    }
    return out;
  }

  /**
   * Frequency signal (spec D9). A pattern in 42 files is a convention; the same
   * pattern in 1 file is a coincidence. The model proposes the probe, ripgrep
   * answers — so the number is measured, never self-reported. Best-effort: a
   * failing grep leaves `occurrences` null rather than failing the scan.
   */
  private async countOccurrences(
    repo: { owner: string; name: string },
    kept: { probe: string; row: { occurrences?: number | null } }[],
  ): Promise<void> {
    await Promise.all(
      kept.map(async (k) => {
        if (!isUsableProbe(k.probe)) return;
        try {
          const matches = await this.container.codeIndex.grep({ owner: repo.owner, name: repo.name }, escapeRegex(k.probe.trim()));
          k.row.occurrences = new Set(matches.map((m) => m.path)).size;
        } catch {
          // Leave null — an unmeasured probe is not a reason to lose the rule.
        }
      }),
    );
  }

  // ------------------------------------------------------------ skill draft

  /**
   * Assemble the accepted candidates into an UNPERSISTED skill. Nothing is
   * written here: the client shows this in the Create-skill modal, the user
   * edits it, and only then does `POST /skills` persist it (spec D6).
   */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.intelRepo.getRepoBasics(repoId);
    if (!repo) throw new ValidationError('Repo not found');
    const rows = await this.repo.listByStatus(workspaceId, repoId, ['accepted']);
    if (rows.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill.');
    }
    const accepted = rows.map(toConventionDto);
    const repoLabel = `${repo.owner}/${repo.name}`;
    return {
      name: DEFAULT_SKILL_NAME,
      description: `${accepted.length} house conventions extracted from ${repo.name}`,
      type: 'convention',
      body: buildSkillBody(accepted, repoLabel),
      evidence_files: evidenceFilesOf(accepted),
    };
  }
}
