import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';

export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

export interface EnqueuedJob {
  id: string;
  done: Promise<void>;
}

export class JobRunner {
  private handlers = new Map<string, JobHandler>();

  constructor(
    private db: Db,
    private retries = 2,
  ) {}

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);
    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;
    const done = this.run(jobId, handler, payload);
    void done.catch(() => {});
    return { id: jobId, done };
  }

  private async run(jobId: string, handler: JobHandler, payload: unknown): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.db.update(t.jobs).set({ status: 'running', attempts: attempt }).where(eq(t.jobs.id, jobId));
        await handler(payload, { jobId });
        await this.db.update(t.jobs).set({ status: 'done' }).where(eq(t.jobs.id, jobId));
        return;
      } catch (err) {
        if (attempt > this.retries) {
          await this.db
            .update(t.jobs)
            .set({ status: 'failed', error: String(err) })
            .where(eq(t.jobs.id, jobId));
          throw err;
        }
      }
    }
  }
}
