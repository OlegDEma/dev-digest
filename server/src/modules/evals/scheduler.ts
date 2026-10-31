import { EVAL_BATCH_CONCURRENCY } from './constants.js';

/**
 * In-process limiter for batch ("Run all agents") eval runs: at most `limit`
 * run at once, the rest wait and start as soon as a running one settles. Holds
 * no timers. The waiting runs are durable `queued` rows, failed by the caller's
 * `.catch` and by the boot reaper (onion rule 8).
 */
export class EvalBatchQueue {
  private active = 0;
  private reserved = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number = EVAL_BATCH_CONCURRENCY) {}

  /** Slots a new submission would get right away. */
  freeSlots(): number {
    return Math.max(0, this.limit - this.active - this.reserved - this.waiting.length);
  }

  /**
   * Synchronously claim up to `n` free slots for rows about to be inserted as
   * `running`. Claim before the awaited insert so a concurrent batch cannot take
   * the same slots; hand each back with `submit(…, true)` or `release`.
   */
  reserve(n: number): number {
    const granted = Math.min(Math.max(0, n), this.freeSlots());
    this.reserved += granted;
    return granted;
  }

  /** Give back reserved slots that were not used. */
  release(n: number): void {
    this.reserved = Math.max(0, this.reserved - n);
    this.drain();
  }

  /**
   * Run `start` when a slot is free (immediately when it consumes a reservation).
   * The returned promise settles with `start`'s outcome; a rejection never blocks
   * the next waiting run.
   */
  submit(start: () => Promise<void>, reservation = false): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const task = () => {
        this.active++;
        Promise.resolve()
          .then(start)
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.drain();
          });
      };
      if (reservation) {
        this.reserved = Math.max(0, this.reserved - 1);
        task();
      } else if (this.active + this.reserved < this.limit && this.waiting.length === 0) task();
      else this.waiting.push(task);
    });
  }

  private drain(): void {
    while (this.waiting.length > 0 && this.active + this.reserved < this.limit) this.waiting.shift()!();
  }
}
