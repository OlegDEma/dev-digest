import type { Container } from '../platform/container.js';
import { createAgentRun, failAgentRun } from './repository/run.repo.js';
import { RunExecutor } from './run-executor.js';
import { withTimeout } from './with-timeout.js';

const CREATE_RUN_TIMEOUT_MS = 5_000;

export class ReviewRerunService {
  private executor: RunExecutor;

  constructor(private container: Container) {
    this.executor = new RunExecutor(container);
  }

  async rerun(workspaceId: string, prId: string): Promise<{ run_id: string }> {
    const run = await withTimeout(
      createAgentRun(this.container.db, { workspaceId, prId }),
      CREATE_RUN_TIMEOUT_MS,
    );
    void this.executor.execute(workspaceId, run.id).catch((err: unknown) =>
      failAgentRun(this.container.db, run.id, String(err)),
    );
    return { run_id: run.id };
  }
}
