// server/src/modules/pulls/service.ts
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PullsRepository } from './repository.js';

export class PullsService {
  constructor(
    private readonly container: Container,
    private readonly repo: PullsRepository,
  ) {}

  async refresh(workspaceId: string, repoId: string): Promise<number> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const gh = this.container.github();
    const pulls = await gh.listPulls({ owner: repo.owner, name: repo.name });
    await this.repo.upsertPulls(repoId, pulls);
    return pulls.length;
  }
}
