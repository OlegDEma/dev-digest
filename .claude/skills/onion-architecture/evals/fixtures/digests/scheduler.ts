import type { Container } from '../platform/container.js';
import * as t from '../db/schema.js';
import { DigestRepository } from './repository.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

export function startWeeklyDigestScheduler(container: Container): void {
  if (timer) return;
  timer = setInterval(() => {
    void runWeeklyDigests(container).catch(() => {});
  }, WEEK_MS);
}

async function runWeeklyDigests(container: Container): Promise<void> {
  const repo = new DigestRepository(container);
  const to = new Date();
  const from = new Date(to.getTime() - WEEK_MS);
  const repos = await container.db.select().from(t.repos);
  for (const r of repos) {
    await repo.buildAndSaveDigest(r.workspaceId, r.id, from, to);
  }
}
