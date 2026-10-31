import { describe, it, expect } from 'vitest';
import { EvalBatchQueue } from '../src/modules/evals/scheduler.js';

/** A task whose completion the test controls. */
function gated() {
  let release!: () => void;
  let fail!: (e: Error) => void;
  const gate = new Promise<void>((res, rej) => {
    release = res;
    fail = rej;
  });
  return { gate, release, fail };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('EvalBatchQueue (AC-D77, AC-D79)', () => {
  it('runs at most 2 at once; the rest start as soon as one settles', async () => {
    const q = new EvalBatchQueue(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const gates = [gated(), gated(), gated(), gated()];
    const done = gates.map((g, i) =>
      q.submit(async () => {
        started.push(i);
        running++;
        peak = Math.max(peak, running);
        await g.gate;
        running--;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(q.freeSlots()).toBe(0);

    gates[0]!.release();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1]!.release();
    await tick();
    expect(started).toEqual([0, 1, 2, 3]);
    gates[2]!.release();
    gates[3]!.release();
    await Promise.all(done);
    expect(peak).toBe(2);
    expect(q.freeSlots()).toBe(2);
  });

  it('a failing run releases its slot and never blocks the next (AC-D77)', async () => {
    const q = new EvalBatchQueue(1);
    const first = gated();
    const order: string[] = [];
    const a = q.submit(async () => {
      order.push('a');
      await first.gate;
    });
    const b = q.submit(async () => {
      order.push('b');
    });
    const aSettled = a.catch((e: Error) => e.message);
    await tick();
    expect(order).toEqual(['a']);
    first.fail(new Error('bad model id'));
    expect(await aSettled).toBe('bad model id');
    await b;
    expect(order).toEqual(['a', 'b']);
  });

  it('a synchronous throw in start is a rejection, not a crash', async () => {
    const q = new EvalBatchQueue(1);
    await expect(
      q.submit(() => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
    await expect(q.submit(async () => {})).resolves.toBeUndefined();
  });

  it('freeSlots counts running and waiting submissions', async () => {
    const q = new EvalBatchQueue(2);
    expect(q.freeSlots()).toBe(2);
    const g = [gated(), gated(), gated()];
    const all = g.map((x) => q.submit(() => x.gate));
    await tick();
    expect(q.freeSlots()).toBe(0);
    g.forEach((x) => x.release());
    await Promise.all(all);
    expect(q.freeSlots()).toBe(2);
  });

  it('holds no timers: the queue drains with fake timers frozen', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      const q = new EvalBatchQueue(1);
      const seen: number[] = [];
      const p = [1, 2, 3].map((n) => q.submit(async () => void seen.push(n)));
      await Promise.all(p);
      expect(seen).toEqual([1, 2, 3]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reservations are claimed synchronously: concurrent claimers never exceed the limit (AC-D79)', async () => {
    const q = new EvalBatchQueue(2);
    expect(q.reserve(3)).toBe(2);
    expect(q.reserve(3)).toBe(0);
    expect(q.freeSlots()).toBe(0);
    q.release(1);
    expect(q.freeSlots()).toBe(1);
    expect(q.reserve(1)).toBe(1); // reserved is now 2
    const g = gated();
    const started: string[] = [];
    const reservedRun = q.submit(async () => { started.push('r'); await g.gate; }, true);
    const waiting = q.submit(async () => { started.push('w'); });
    await tick();
    expect(started).toEqual(['r']); // the second slot is still reserved, so 'w' waits
    q.release(1);
    await tick();
    expect(started).toEqual(['r', 'w']);
    g.release();
    await Promise.all([reservedRun, waiting]);
    expect(q.freeSlots()).toBe(2);
  });
});
