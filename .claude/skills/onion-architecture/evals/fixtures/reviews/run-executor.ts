import type { Container } from '../platform/container.js';
import { completeAgentRun, getRunForWorkspace } from './repository/run.repo.js';

export class RunExecutor {
  constructor(private container: Container) {}

  async execute(workspaceId: string, runId: string): Promise<void> {
    const run = await getRunForWorkspace(this.container.db, workspaceId, runId);
    if (!run) return;
    const llm = await this.container.llm('anthropic');
    const result = await llm.complete({
      model: 'claude-sonnet-5-5',
      messages: [{ role: 'user', content: `Review pull request ${run.prId}` }],
    });
    await completeAgentRun(this.container.db, runId, result.costUsd);
  }
}
