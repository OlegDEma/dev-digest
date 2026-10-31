import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { makeDetail } from "@/lib/test-support/eval-fixtures";
import {
  useAgentEvalRuns,
  useCreateEvalCase,
  useEvalCaseDraft,
  useEvalRun,
  useStartEvalRun,
  useUpdateEvalCase,
} from "./evals";

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
      result.current.mutate(undefined);
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
      result.current.mutate(undefined);
      await vi.advanceTimersByTimeAsync(0);
    });
    const err = result.current.error as unknown as { code: string; details: { run_id: string } };
    expect(err.code).toBe("eval_run_in_progress");
    expect(err.details.run_id).toBe("run9");
  });
});

describe("case hooks and single-case runs (AC-D25, AC-D30, AC-D33b, AC-D35a)", () => {
  const callOf = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit];

  it("useStartEvalRun sends { case_id } as the body of a scope-case run", async () => {
    fetchMock.mockImplementation(() => json(makeDetail({ status: "running", scope: "case" }), 202));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: Wrapper });
    await act(async () => {
      result.current.mutate({ case_id: "c1" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(JSON.parse(callOf()[1].body as string)).toEqual({ case_id: "c1" });
  });

  it("useStartEvalRun sends no body for a full run", async () => {
    fetchMock.mockImplementation(() => json(makeDetail({ status: "running" }), 202));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: Wrapper });
    await act(async () => {
      result.current.mutate(undefined);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(callOf()[1].body).toBeUndefined();
  });

  it("useAgentEvalRuns keeps polling while a run is queued, then invalidates once it settles", async () => {
    const queued = makeDetail({ id: "r1", status: "queued" });
    fetchMock
      .mockImplementationOnce(() => json([queued]))
      .mockImplementationOnce(() => json([{ ...queued, status: "running" }]))
      .mockImplementation(() => json([{ ...queued, status: "done" }]));
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useAgentEvalRuns("ag1").data, { wrapper: Wrapper });
    await tick(0);
    await tick(4000); // queued -> running: still active, no invalidation
    expect(spy).not.toHaveBeenCalled();
    await tick(4000); // running -> done
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
    expect(keys).toContain('["eval-cases","ag1"]');
  });

  it("useEvalRun polls while the run is queued", async () => {
    fetchMock
      .mockImplementationOnce(() => json(makeDetail({ status: "queued" })))
      .mockImplementation(() => json(makeDetail({ status: "done" })));
    const { Wrapper } = wrapper();
    renderHook(() => useEvalRun("run1").data, { wrapper: Wrapper });
    await tick(0);
    await tick(4300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("useCreateEvalCase POSTs the case body to /agents/:id/eval-cases, with source_finding_id", async () => {
    fetchMock.mockImplementation(() => json({ id: "c1" }, 201));
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCase("ag1"), { wrapper: Wrapper });
    const body = {
      name: "n",
      input_diff: "d",
      input_files: [],
      pr_meta: { title: "", description: "" },
      expected: [],
      source_finding_id: "00000000-0000-4000-8000-000000000001",
    };
    await act(async () => {
      result.current.mutate(body);
      await vi.advanceTimersByTimeAsync(0);
    });
    const [url, init] = callOf();
    expect(url).toMatch(/\/agents\/ag1\/eval-cases$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))).toContain('["eval-cases","ag1"]');
  });

  it("useUpdateEvalCase PUTs to /eval-cases/:id", async () => {
    fetchMock.mockImplementation(() => json({ id: "c1" }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useUpdateEvalCase("ag1"), { wrapper: Wrapper });
    await act(async () => {
      result.current.mutate({ id: "c1", body: { name: "n", input_diff: "d", input_files: [], pr_meta: { title: "", description: "" }, expected: [] } });
      await vi.advanceTimersByTimeAsync(0);
    });
    const [url, init] = callOf();
    expect(url).toMatch(/\/eval-cases\/c1$/);
    expect(init.method).toBe("PUT");
  });

  it("create/update are silentError (the editor shows the error inline); start-run is opt-in", async () => {
    fetchMock.mockImplementation(() => json({ id: "c1" }));
    const { client, Wrapper } = wrapper();
    const body = { name: "n", input_diff: "d", input_files: [], pr_meta: { title: "", description: "" }, expected: [] };
    const { result } = renderHook(
      () => ({
        create: useCreateEvalCase("ag1"),
        update: useUpdateEvalCase("ag1"),
        plain: useStartEvalRun("ag1"),
        quiet: useStartEvalRun("ag1", { silentError: true }),
      }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.create.mutate(body);
      result.current.update.mutate({ id: "c1", body });
      result.current.plain.mutate(undefined);
      result.current.quiet.mutate(undefined);
      await vi.advanceTimersByTimeAsync(0);
    });
    const metas = client.getMutationCache().getAll().map((m) => m.meta);
    expect(metas).toEqual([{ silentError: true }, { silentError: true }, undefined, { silentError: true }]);
  });

  it("useEvalCaseDraft GETs the finding's draft only when given an id, and surfaces eval_case_exists", async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: "eval_case_exists", message: "exists", details: { case_id: "c9" } } }, 409),
    );
    const { Wrapper } = wrapper();
    const idle = renderHook(() => useEvalCaseDraft(null), { wrapper: Wrapper });
    await tick(0);
    expect(fetchMock).not.toHaveBeenCalled();
    idle.unmount();
    const { result } = renderHook(() => ({ e: useEvalCaseDraft("f1").error }), { wrapper: Wrapper });
    await tick(0);
    expect(callOf()[0]).toMatch(/\/findings\/f1\/eval-case-draft$/);
    expect((result.current.e as unknown as { code: string }).code).toBe("eval_case_exists");
  });
});
