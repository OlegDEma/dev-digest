import { reapStaleRunningRuns } from '../reviews/repository/run.repo.js';
import type { Container } from './container.js';

export async function onBoot(container: Container): Promise<void> {
  await reapStaleRunningRuns(container.db);
}
