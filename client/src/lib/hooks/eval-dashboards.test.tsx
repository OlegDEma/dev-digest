import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { makeAgentDashboard } from "@/lib/test-support/eval-dashboard-fixtures";
import { makeRun } from "@/lib/test-support/eval-fixtures";
import { makeDetail } from "@/lib/test-support/eval-fixtures";
import { useWatchEvalRuns, useAgentEvalConfig, useAgentEvalDashboard, usePromoteEvalRun, useStartEvalBatch } from "./eval-dashboards";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, statusText: "", json: async () => body });

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("eval dashboard hooks", () => {
  it("requests the per-agent dashboard with the range (AC-D65a)", async () => {
    fetchMock.mockImplementation(() => json(makeAgentDashboard()));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAgentEvalDashboard("ag1", "90d"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/agents\/ag1\/eval-dashboard\?range=90d$/);
    expect(result.current.data?.agent.name).toBe("Security Reviewer");
  });

  it("starts the batch with one POST (AC-D74)", async () => {
    fetchMock.mockImplementation(() => json({ started: [], queued: [], skipped: [] }, 202));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalBatch(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/eval-runs\/batch$/);
    expect(fetchMock.mock.calls[0]![1].method).toBe("POST");
  });

  it("promotes with run id + expected config id and refreshes agent and eval data (AC-D60b)", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/promote") ? json({ agent: { id: "ag1" }, version: 9 }) : json(makeRun()),
    );
    const { Wrapper, client } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => usePromoteEvalRun("ag1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ run_id: "11111111-1111-4111-8111-111111111111", expected_config_id: "cfg1" });
    });
    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toMatch(/\/agents\/ag1\/promote$/);
    expect(JSON.parse(call[1].body)).toEqual({ run_id: "11111111-1111-4111-8111-111111111111", expected_config_id: "cfg1" });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["agent","ag1"]', '["eval-config","ag1"]', '["eval-dashboard"]']));
  });

  it("loads the live config snapshot (AC-D54)", async () => {
    fetchMock.mockImplementation(() => json(makeRun().config));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAgentEvalConfig("ag1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.config_id).toBe("cfg1"));
  });

  it("refreshes the overview exactly once, after every batch run has finished (AC-D76)", async () => {
    let calls = 0;
    fetchMock.mockImplementation((url: string) => {
      calls++;
      const id = String(url).split("/").pop();
      // first poll: both running; later polls: finished
      return json(makeDetail({ id, status: calls <= 2 ? "running" : "done" }));
    });
    const { Wrapper, client } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useWatchEvalRuns(["r1", "r2"]), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe(2));
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === '{"queryKey":["eval-dashboard"]}')).toHaveLength(0);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["eval-run"] });
    });
    await waitFor(() => expect(result.current).toBe(0));
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === '{"queryKey":["eval-dashboard"]}')).toHaveLength(1);
  });
  it("a transient poll error does not latch the overview: errored-with-data counts by its data status", async () => {
    let calls = 0;
    fetchMock.mockImplementation(() => {
      calls++;
      if (calls === 1) return json(makeDetail({ id: "r1", status: "running" }));
      if (calls === 2) return Promise.reject(new Error("network blip"));
      return json(makeDetail({ id: "r1", status: "done" }));
    });
    const { Wrapper, client } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const overview = () => spy.mock.calls.filter((c) => JSON.stringify(c[0]) === '{"queryKey":["eval-dashboard"]}');
    const { result } = renderHook(() => useWatchEvalRuns(["r1"]), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe(1));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["eval-run"] });
    });
    expect(client.getQueryState(["eval-run", "r1"])?.status).toBe("error");
    expect(result.current).toBe(1);
    expect(overview()).toHaveLength(0);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["eval-run"] });
    });
    await waitFor(() => expect(result.current).toBe(0));
    expect(overview()).toHaveLength(1);
  });
});
