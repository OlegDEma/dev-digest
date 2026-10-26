import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { StructuredOutputError } from '@devdigest/shared';
import * as t from '../../src/db/schema.js';
import type { PgFixture } from './pg.js';

export { makeClone, insertRepoAndPr } from './project-context.js';

type Db = PgFixture['handle']['db'];

export interface SeedFile {
  path: string;
  pagerank: number;
  hotness?: number;
  percentile?: number;
  endpoints?: string[];
}

export interface SeedIndexOpts {
  sha?: string;
  status?: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed?: number;
  filesSkipped?: number;
  stats?: Record<string, unknown>;
  files?: SeedFile[];
  /** [from, to] import edges. */
  edges?: Array<[string, string]>;
  repoMap?: string | null;
}

/** Write repo_index_state + file_rank + file_edges + file_facts (+ repo_map_cache) for a repo. */
export async function seedIndex(db: Db, repoId: string, o: SeedIndexOpts = {}) {
  const sha = o.sha ?? 'sha-index-1';
  const files = o.files ?? [];
  await db
    .insert(t.repoIndexState)
    .values({
      repoId,
      lastIndexedSha: sha,
      indexerVersion: 1,
      status: o.status ?? 'full',
      filesIndexed: o.filesIndexed ?? files.length,
      filesSkipped: o.filesSkipped ?? 0,
      stats: o.stats ?? { totalCandidates: files.length, bounded: 0, hotnessAvailable: false },
    })
    .onConflictDoUpdate({
      target: t.repoIndexState.repoId,
      set: {
        lastIndexedSha: sha,
        status: o.status ?? 'full',
        filesIndexed: o.filesIndexed ?? files.length,
        filesSkipped: o.filesSkipped ?? 0,
        stats: o.stats ?? { totalCandidates: files.length, bounded: 0, hotnessAvailable: false },
      },
    });
  const CHUNK = 500;
  for (let i = 0; i < files.length; i += CHUNK) {
    await db.insert(t.fileRank).values(
      files.slice(i, i + CHUNK).map((f, j) => ({
        repoId,
        filePath: f.path,
        pagerank: f.pagerank,
        hotness: f.hotness ?? 0,
        rank: f.pagerank * (1 + (f.hotness ?? 0)),
        percentile: f.percentile ?? Math.max(0, 100 - (i + j)),
      })),
    ).onConflictDoNothing();
  }
  const edges = o.edges ?? [];
  for (let i = 0; i < edges.length; i += CHUNK) {
    await db
      .insert(t.fileEdges)
      .values(edges.slice(i, i + CHUNK).map(([fromFile, toFile]) => ({ repoId, fromFile, toFile })))
      .onConflictDoNothing();
  }
  const withEndpoints = files.filter((f) => (f.endpoints?.length ?? 0) > 0);
  if (withEndpoints.length > 0) {
    await db
      .insert(t.fileFacts)
      .values(withEndpoints.map((f) => ({ repoId, filePath: f.path, endpoints: f.endpoints!, crons: [] })))
      .onConflictDoNothing();
  }
  if (o.repoMap) {
    await db
      .insert(t.repoMapCache)
      .values({ repoId, commitSha: sha, tokenBudget: 1500, mapText: o.repoMap, tokenCount: 10 })
      .onConflictDoNothing();
  }
}

export type ScriptStep =
  | { kind: 'ok'; data: unknown; attempts?: number; tokensIn?: number; tokensOut?: number; costUsd?: number | null }
  | { kind: 'throw'; error?: Error }
  | { kind: 'invalid'; attempts?: number; tokensIn?: number; tokensOut?: number; costUsd?: number | null }
  | { kind: 'never' }
  | { kind: 'slow'; ms: number; data: unknown }
  /** Signals `started` on entry, then waits for `release()` — a deterministic gate. */
  | { kind: 'gate'; data: unknown };

/** Counting, scripted LLM provider: the last step repeats. */
export class ScriptedLLM implements LLMProvider {
  readonly id: 'openai' | 'anthropic' = 'openai';
  structuredCalls: StructuredRequest<unknown>[] = [];
  otherCalls = 0;
  /** Resolves when a `gate` step is entered (the snapshot and facts are already read). */
  readonly started: Promise<void>;
  private markStarted!: () => void;
  private releaseGate!: () => void;
  private gate: Promise<void>;
  constructor(private steps: ScriptStep[]) {
    this.started = new Promise<void>((r) => (this.markStarted = r));
    this.gate = new Promise<void>((r) => (this.releaseGate = r));
  }

  release(): void {
    this.releaseGate();
  }

  async listModels() {
    this.otherCalls++;
    return [];
  }
  async complete(): Promise<never> {
    this.otherCalls++;
    throw new Error('complete not scripted');
  }
  async embed(): Promise<number[][]> {
    this.otherCalls++;
    return [];
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.structuredCalls.push(req as StructuredRequest<unknown>);
    const step = this.steps[Math.min(this.structuredCalls.length - 1, this.steps.length - 1)]!;
    switch (step.kind) {
      case 'throw':
        throw step.error ?? new Error('provider exploded');
      case 'never':
        return new Promise<never>(() => {});
      case 'invalid':
        throw new StructuredOutputError({
          schemaName: req.schemaName,
          attempts: step.attempts ?? 3,
          tokensIn: step.tokensIn ?? 300,
          tokensOut: step.tokensOut ?? 90,
          costUsd: step.costUsd === undefined ? 0.003 : step.costUsd,
        });
      case 'gate':
        this.markStarted();
        await this.gate;
        return this.ok(req, step.data, {});
      case 'slow':
        await new Promise((r) => setTimeout(r, step.ms));
        return this.ok(req, step.data, {});
      case 'ok':
        return this.ok(req, step.data, step);
    }
  }
  private ok<T>(
    req: StructuredRequest<T>,
    data: unknown,
    o: { attempts?: number; tokensIn?: number; tokensOut?: number; costUsd?: number | null },
  ): StructuredResult<T> {
    return {
      data: (req.schema as { parse: (d: unknown) => T }).parse(data),
      model: req.model,
      tokensIn: o.tokensIn ?? 6000,
      tokensOut: o.tokensOut ?? 1200,
      costUsd: o.costUsd === undefined ? 0.0123 : o.costUsd,
      raw: '',
      attempts: o.attempts ?? 1,
    };
  }
}
