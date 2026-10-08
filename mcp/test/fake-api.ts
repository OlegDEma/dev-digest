import type {
  ActiveRun,
  Agent,
  ConventionCandidate,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRunResponse,
  RunDetail,
  RunRequest,
} from '@devdigest/shared';
import type { DevDigestApi } from '../src/api/port.js';
import { ApiError } from '../src/errors.js';

export const REPO_ID = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_ID = '33333333-3333-4333-8333-333333333333';
export const DISABLED_AGENT_ID = '44444444-4444-4444-8444-444444444444';
export const RUN_ID = '55555555-5555-4555-8555-555555555555';

export const repo: Repo = {
  id: REPO_ID,
  workspace_id: 'w',
  owner: 'acme',
  name: 'widgets',
  full_name: 'acme/widgets',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

export const pull: PrMeta = {
  id: PR_ID,
  number: 7,
  title: 't',
  author: 'a',
  branch: 'b',
  base: 'main',
  head_sha: 'abc',
  additions: 1,
  deletions: 1,
  files_count: 1,
  status: 'open',
};

const baseAgent = {
  description: 'd',
  provider: 'openai',
  model: 'gpt-x',
  system_prompt: 'SECRET-PROMPT '.repeat(360),
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
} as const;

export const agents: Agent[] = [
  { ...baseAgent, id: AGENT_ID, name: 'Security Reviewer', enabled: true },
  { ...baseAgent, id: DISABLED_AGENT_ID, name: 'Old Reviewer', enabled: false },
];

export function finding(i: number, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: `f${i}`,
    review_id: 'r1',
    severity: 'SUGGESTION',
    category: 'style',
    title: `title ${i}`,
    file: `src/f${i % 7}.ts`,
    start_line: i + 1,
    end_line: i + 2,
    rationale: `rationale ${i}`,
    suggestion: `suggestion ${i}`,
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

export function runDetail(over: Partial<RunDetail> = {}, findings: FindingRecord[] = []): RunDetail {
  return {
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    agent_name: 'Security Reviewer',
    provider: 'openai',
    model: 'gpt-x',
    status: 'done',
    error: null,
    duration_ms: 1,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: 0,
    findings_count: findings.length,
    grounding: null,
    ran_at: null,
    score: 80,
    blockers: 0,
    pr_id: PR_ID,
    review: {
      id: 'r1',
      pr_id: PR_ID,
      agent_id: AGENT_ID,
      run_id: RUN_ID,
      agent_name: 'Security Reviewer',
      kind: 'review',
      verdict: 'comment',
      summary: 'looks ok',
      score: 80,
      model: 'gpt-x',
      created_at: 'now',
      findings,
    },
    ...over,
  };
}

export const runningDetail = (): RunDetail => runDetail({ status: 'running', review: null, score: null });

export const convention = (
  i: number,
  status: ConventionCandidate['status'],
): ConventionCandidate => ({
  id: `c${i}`,
  category: 'naming',
  rule: `rule ${i}`,
  evidence_path: `src/c${i}.ts`,
  evidence_line: i,
  evidence_snippet: 'x',
  confidence: 0.8,
  status,
  created_at: 'now',
});

type Step = RunDetail | Error;

/** In-memory DevDigestApi: a call log and a scripted `getRun` sequence (last step repeats). */
export class FakeApi implements DevDigestApi {
  calls: string[] = [];
  repos: Repo[] = [repo];
  pulls: PrMeta[] = [pull];
  agents: Agent[] = agents;
  active: ActiveRun[] = [];
  conventions: ConventionCandidate[] = [];
  runs: Step[] = [runningDetail()];
  failAll: Error | null = null;
  getRunSignals: (AbortSignal | undefined)[] = [];
  private runIdx = 0;

  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }

  private enter(name: string): void {
    this.calls.push(name);
    if (this.failAll) throw this.failAll;
  }

  async listRepos(): Promise<Repo[]> {
    this.enter('listRepos');
    return this.repos;
  }
  async listPulls(): Promise<PrMeta[]> {
    this.enter('listPulls');
    return this.pulls;
  }
  async listAgents(): Promise<Agent[]> {
    this.enter('listAgents');
    return this.agents;
  }
  async activeRuns(): Promise<ActiveRun[]> {
    this.enter('activeRuns');
    return this.active;
  }
  async startReview(_prId: string, _body: RunRequest): Promise<ReviewRunResponse> {
    this.enter('startReview');
    return {
      pr_id: PR_ID,
      runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security Reviewer' }],
      reviews: [],
    };
  }
  async getRun(_runId: string, signal?: AbortSignal): Promise<RunDetail> {
    this.enter('getRun');
    this.getRunSignals.push(signal);
    const step = this.runs[Math.min(this.runIdx, this.runs.length - 1)]!;
    this.runIdx += 1;
    if (step instanceof Error) throw step;
    return step;
  }
  async listConventions(): Promise<ConventionCandidate[]> {
    this.enter('listConventions');
    return this.conventions;
  }
}

export const unreachableError = (): ApiError => new ApiError(null, 'unreachable', 'ECONNREFUSED');
