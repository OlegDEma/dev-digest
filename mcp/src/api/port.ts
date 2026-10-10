import type { ActiveRun, Agent, ConventionCandidate, PrBlastResponse, PrMeta, Repo, ReviewRunResponse, RunDetail, RunRequest } from '@devdigest/shared';

/** The DevDigest API as the tools see it. The only network adapter is `http.ts`. */
export interface DevDigestApi {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  listAgents(): Promise<Agent[]>;
  activeRuns(prId: string): Promise<ActiveRun[]>;
  startReview(prId: string, body: RunRequest): Promise<ReviewRunResponse>;
  getRun(runId: string, signal?: AbortSignal): Promise<RunDetail>;
  listConventions(repoId: string): Promise<ConventionCandidate[]>;
  getBlast(prId: string): Promise<PrBlastResponse>;
}
