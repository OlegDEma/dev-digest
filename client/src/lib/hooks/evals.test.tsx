import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { makeDetail } from "@/lib/test-support/eval-fixtures";
import { useAgentEvalRuns, useEvalRun, useStartEvalRun } from "./evals";

const fetchMock = vi.fn();

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

/** A plain fetch-like response: Response body streams need real macrotasks, which fake timers hold back. */
const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, statusText: "", json: async () => body });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

/** Advance fake time, then 250 ms more so the query layer can deliver the fetch result. */
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(50);
  });
};

describe("useEvalRun polling (AC-29a, AC-29c)", () => {
  it("polls every 4 s while running, survives a failed tick, and stops when finished", async () => {
    fetchMock
      .mockImplementationOnce(() => json(makeDetail({ status: "running", progress: { done: 1, total: 8 } })))
      .mockImplementationOnce(() => json(makeDetail({ status: "running", progress: { done: 2, total: 8 } })))
      .mockImplementationOnce(() => Promise.reject(new TypeError("offline")))
      .mockImplementationOnce(() => json(makeDetail({ status: "done" })));
    const { Wrapper } = wrapper();
    // Read isError in the hook body: React Query only re-renders for the props a render touched.
    const { result } = renderHook(
      () => {
        const q = useEvalRun("run1");
        return { data: q.data, isError: q.isError };
      },
      { wrapper: Wrapper },
    );

    await tick(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.data?.progress.done).toBe(1);

    await tick(3300); // t = 3.8 s: not yet
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(300); // t = 4.3 s: first poll
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.data?.progress.done).toBe(2);

    await tick(4000); // second poll fails: keep the last data, flag the error
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.isError).toBe(true);
    expect(result.current.data?.progress.done).toBe(2);

    await tick(4000); // next tick recovers
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.status).toBe("done");

    await tick(12000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("useAgentEvalRuns completion (list-only tracking after a reload)", () => {
  it("invalidates cases, runs and dashboard once when the polled list flips running -> done", async () => {
    const running = makeDetail({ id: "r1", status: "running" });
    fetchMock
      .mockImplementationOnce(() => json([running]))
      .mockImplementationOnce(() => json([running]))
      .mockImplementation(() => json([makeDetail({ id: "r1", status: "done" })]));
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(
      () => {
        const q = useAgentEvalRuns("ag1");
        return q.data;
      },
      { wrapper: Wrapper },
    );
    await tick(0);
    await tick(4000); // still running: nothing yet
    expect(spy).not.toHaveBeenCalled();
    await tick(4000); // list now shows it done
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
    expect(keys.filter((k) => k === '["eval-cases","ag1"]')).toHaveLength(1);
    expect(keys).toEqual(expect.arrayContaining(['["eval-runs","ag1"]', '["eval-dashboard"]']));
    await tick(8000);
    expect(spy.mock.calls.length).toBe(keys.length);
  });
});

describe("useStartEvalRun (AC-22a, AC-30b)", () => {
  it("POSTs to /agents/:id/eval-runs", async () => {
    fetchMock.mockImplementation(() => json(makeDetail({ status: "running" }), 202));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: Wrapper });
    await act(async () => {
      result.current.mutate();
      await vi.advanceTimersByTimeAsync(0);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/agents\/ag1\/eval-runs$/);
    expect(init.method).toBe("POST");
  });

  it("exposes the 409 code and the running run id on the ApiError", async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: "eval_run_in_progress", message: "running", details: { run_id: "run9" } } }, 409),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: Wrapper });
    await act(async () => {
      result.current.mutate();
      await vi.advanceTimersByTimeAsync(0);
    });
    const err = result.current.error as unknown as { code: string; details: { run_id: string } };
    expect(err.code).toBe("eval_run_in_progress");
    expect(err.details.run_id).toBe("run9");
  });
});
