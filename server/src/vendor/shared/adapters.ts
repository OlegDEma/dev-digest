import { z } from 'zod';
import type {
  PrMeta,
  PrDetail,
  IssueMeta,
  PrReviewComment,
} from './contracts/platform.js';

/**
 * Adapter interfaces. ALL external calls go behind these interfaces.
 * Real implementations live in `apps/api/src/adapters/*`; mock implementations
 * live alongside for tests/dev (Services depend on the interface, not the impl).
 */

// ---------- LLM ----------
export const ModelInfo = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  label: z.string().nullish(),
  created: z.number().int().nullish(),
  /** Pricing in USD per 1M tokens (when the provider exposes it, e.g. OpenRouter). */
  pricing: z
    .object({ promptPerM: z.number(), completionPerM: z.number() })
    .nullish(),
  /** Max context window in tokens (when the provider exposes it). */
  contextLength: z.number().int().nullish(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/**
 * Structured-output request. `schema` is a Zod schema; `schemaName` names the
 * tool / json_schema. `maxRetries` controls reprompt-on-error.
 */
export interface StructuredRequest<T> {
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * OpenRouter session id — groups related generations (e.g. all map-reduce
   * chunks of one review) into a session in the OpenRouter dashboard. Sent as
   * the `session_id` body field; ignored by providers that don't support it.
   */
  sessionId?: string;
  /** OpenRouter: only route to providers that support every request parameter (e.g. strict json_schema). */
  requireParameters?: boolean;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  raw: string;
  attempts: number;
}

/**
 * Thrown by an LLMProvider when a structured call exhausts its retries without
 * a schema-valid reply. Carries the accounting of all attempts, never the raw
 * model output. Match with `isStructuredOutputError` (by name, safe across
 * module instances).
 */
export class StructuredOutputError extends Error {
  readonly statusCode = 502;
  readonly schemaName: string;
  readonly attempts: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number | null;
  constructor(info: {
    schemaName: string;
    attempts: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
  }) {
    super(`LLM output failed schema validation for ${info.schemaName} after ${info.attempts} attempt(s)`);
    this.name = 'StructuredOutputError';
    this.schemaName = info.schemaName;
    this.attempts = info.attempts;
    this.tokensIn = info.tokensIn;
    this.tokensOut = info.tokensOut;
    this.costUsd = info.costUsd;
  }
}

export function isStructuredOutputError(e: unknown): e is StructuredOutputError {
  return e instanceof Error && e.name === 'StructuredOutputError';
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

// ---------- Embedder ----------
export interface Embedder {
  /** OpenAI text-embedding-3-small → 1536 dims. */
  embed(texts: string[]): Promise<number[][]>;
  readonly dims: number;
}

// ---------- GitHub (Octokit REST, thin) ----------
export interface RepoRef {
  owner: string;
  name: string;
}

export interface GitHubReviewPayload {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: { path: string; line: number; body: string }[];
}

/** Create one standalone inline review comment (or a reply to a thread). */
export interface CreateReviewCommentInput {
  /** Head commit the comment pins to (GitHub requires commit_id). */
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
  /** When set, post as a reply to that comment's thread instead of a new one. */
  inReplyTo?: number;
}

export interface OpenPrPayload {
  title: string;
  head: string;
  base: string;
  body: string;
}

/** A single file to write in a commit (path relative to repo root + UTF-8 text). */
export interface CommitFile {
  path: string;
  contents: string;
}

export interface CommitFilesPayload {
  /** Branch to create-or-update with the commit (e.g. "devdigest/ci"). */
  branch: string;
  /** Base branch to fork from when `branch` does not yet exist (e.g. "main"). */
  base: string;
  message: string;
  files: CommitFile[];
}

export interface PrTouchingFile {
  number: number;
  title: string;
  merged_at: string | null;
  author: string;
  path: string;
}
export interface HistoryLimits {
  maxFiles: number;
  perFileCommits: number;
  maxCommits: number;
  /** Overall budget for the whole fan-out; the call rejects once it is spent. */
  deadlineMs: number;
  /** How many PR lookups may run at once. */
  concurrency: number;
}

/** One GitHub Actions workflow run (the fields the CI-runs ingest needs). */
export interface WorkflowRunMeta {
  /** Numeric GitHub run id as a string (stable, globally unique). */
  id: string;
  /** `success` | `failure` | … ; null while the run has not finished. */
  conclusion: string | null;
  /** ISO timestamp the run was created. */
  created_at: string;
  html_url: string;
}

/** One artifact attached to a workflow run. */
export interface RunArtifactMeta {
  id: number;
  name: string;
  expired: boolean;
}

/**
 * Thrown by `GitHubClient.downloadArtifactZip` when GitHub answers 410 (the
 * artifact aged out of retention). Match with `isArtifactExpiredError` (by name,
 * safe across module instances).
 */
export class ArtifactExpiredError extends Error {
  constructor(message = 'Artifact expired') {
    super(message);
    this.name = 'ArtifactExpiredError';
  }
}

export function isArtifactExpiredError(e: unknown): e is ArtifactExpiredError {
  return e instanceof Error && e.name === 'ArtifactExpiredError';
}

export interface GitHubClient {
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  postReview(repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }>;
  /** List inline review comments on a PR (for the "Files changed" tab). */
  listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]>;
  /** Create one inline review comment (or reply) on a PR; returns the new comment. */
  createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment>;
  openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }>;
  /**
   * Commit `files` onto `branch` as ONE atomic commit (Git Data API: blobs →
   * tree → commit → ref). Creates the branch from `base` if missing, else
   * fast-forwards it. Idempotent: re-publishing just adds a new commit.
   */
  commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }>;
  /** The open PR whose head is `branch`, if any (so re-publish reuses it). */
  findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null>;
  /** Workflow runs of `workflowFile` created on/after `sinceIso`, newest first. */
  listWorkflowRuns(repo: RepoRef, workflowFile: string, sinceIso: string): Promise<WorkflowRunMeta[]>;
  /** Artifacts attached to a workflow run. */
  listRunArtifacts(repo: RepoRef, runId: string): Promise<RunArtifactMeta[]>;
  /** The artifact's zip bytes. Throws `ArtifactExpiredError` on 410. */
  downloadArtifactZip(repo: RepoRef, artifactId: number): Promise<Uint8Array>;
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
  /** Raw UTF-8 text of a file at `ref` (contents API — reads a ref, not a working tree). Throws if absent or not a file. */
  getFileContent(repo: RepoRef, path: string, ref: string): Promise<string>;
  /** GET /user — for "posting as @user". */
  currentLogin(): Promise<string>;
  /** PRs associated with recent commits that touched `files` (I/O only; filtering is the caller's). */
  listPrsTouchingFiles(
    repo: RepoRef,
    files: string[],
    excludeNumber: number,
    limits: HistoryLimits,
  ): Promise<PrTouchingFile[]>;
}

// ---------- Git (simple-git, heavy) ----------
export interface CloneOptions {
  depth?: number;
  branch?: string;
}

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines present in the *new* file covered by this hunk (for grounding). */
  newLineNumbers: number[];
  /** Section heading after the closing `@@` (e.g. enclosing function); absent when empty. */
  heading?: string;
}

export interface UnifiedDiff {
  raw: string;
  files: { path: string; additions: number; deletions: number; hunks: DiffHunk[] }[];
}

export interface BlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  summary: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitClient {
  clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }>;
  fetchPullHead(repo: RepoRef, n: number): Promise<void>;
  /**
   * Resync an already-cloned repo to the tip of `branch`: fetch from origin and
   * advance the local working tree to `origin/<branch>`. Unlike `clone`'s bare
   * `fetch` (which only moves remote-tracking refs), this moves local HEAD so a
   * subsequent index reflects the latest code. Returns the new HEAD sha.
   */
  sync(repo: RepoRef, branch: string): Promise<{ head: string }>;
  currentHead(repo: RepoRef): Promise<string>;
  diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;
  /**
   * Names of files changed between two commits (`git diff --name-only base..head`).
   * Two-dot form is intentional — we want files reachable from `head` but not `base`,
   * matching the incremental indexer's "what moved since last_indexed_sha?" semantics.
   * Returns an empty array when the two refs resolve to the same commit.
   */
  diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]>;
  blame(repo: RepoRef, path: string): Promise<BlameLine[]>;
  log(repo: RepoRef, path?: string): Promise<GitCommit[]>;
  readFile(repo: RepoRef, path: string): Promise<string>;
  clonePathFor(repo: RepoRef): string;
}

// ---------- CodeIndex (ripgrep + tree-sitter) ----------
export interface CodeMatch {
  path: string;
  line: number;
  text: string;
}

export interface CodeSymbol {
  path: string;
  name: string;
  kind: string;
  line: number;
}

export interface CodeReference {
  fromPath: string;
  toSymbol: string;
  line: number;
}

export interface CodeIndex {
  grep(repo: RepoRef, pattern: string): Promise<CodeMatch[]>;
  symbols(repo: RepoRef): Promise<CodeSymbol[]>;
  references(repo: RepoRef, symbol: string): Promise<CodeReference[]>;
}

// ---------- Auth (pluggable; MVP = LocalNoAuthProvider) ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthProvider {
  currentUser(req: unknown): Promise<AuthUser>;
  currentWorkspace(req: unknown): Promise<AuthWorkspace>;
}

// ---------- Secrets (pluggable; MVP = LocalSecretsProvider) ----------
export type SecretKey =
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GITHUB_TOKEN'
  | 'DATABASE_URL'
  | (string & {});

export interface SecretsProvider {
  get(key: SecretKey): Promise<string | undefined>;
  /**
   * Persist a secret (BYO key entered via the UI). Optional — read-only
   * providers (e.g. the env-only MVP backend) may omit it.
   */
  set?(key: SecretKey, value: string): Promise<void>;
}

// ---------- CloneDocs (project-context markdown files inside a repo clone) ----------
export interface CloneDocEntry {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
}

export type CloneDocRead =
  | { kind: 'ok'; text: string; sizeBytes: number; mtimeMs: number }
  | { kind: 'not_found' | 'outside_repo' | 'unreadable' }
  | { kind: 'too_large'; sizeBytes: number };

export type CloneDocWrite = 'ok' | 'not_found' | 'outside_repo' | 'write_failed';

export interface CloneDocs {
  /** null = clone root missing. Never follows symlinked entries. */
  discover(
    root: string,
    opts: { buckets: readonly string[]; excludedDirs: readonly string[] },
  ): Promise<CloneDocEntry[] | null>;
  read(root: string, path: string, maxBytes: number): Promise<CloneDocRead>;
  /** Atomic replace of an EXISTING file; never creates. */
  write(root: string, path: string, text: string): Promise<CloneDocWrite>;
  /** The only method that spawns git. */
  isTracked(root: string, path: string): Promise<boolean>;
}

// ---------- CloneFiles (read-only file probes inside a repo clone) ----------
export interface CloneFiles {
  rootExists(root: string): Promise<boolean>;
  /** Sorted direct child directory names; no symlinks; skips `.git` and `node_modules`. */
  listChildDirs(root: string): Promise<string[]>;
  /** Existence probe only — never opens the file. */
  fileExists(root: string, path: string): Promise<'file' | 'missing' | 'outside_repo'>;
  /** Refuses `.env` / `.env.*`; resolves symlinks and rejects targets outside the root. */
  readText(root: string, path: string, maxBytes: number): Promise<CloneDocRead>;
}
