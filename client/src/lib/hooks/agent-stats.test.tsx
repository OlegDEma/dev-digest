import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAgentsStats, useAgentStats } from "./agent-stats";

const fetchMock = vi.fn();

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, statusText: "", json: async () => body });

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("agent stats hooks (AC-D86)", () => {
  it("useAgentsStats reads GET /agents/stats once", async () => {
    fetchMock.mockReturnValue(json([{ agent_id: "a1", runs: 3 }]));
    const { result } = renderHook(() => useAgentsStats(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ agent_id: "a1", runs: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/agents\/stats$/);
  });

  it("useAgentStats reads GET /agents/:id/stats and stays idle without an id", async () => {
    fetchMock.mockReturnValue(json({ agent_id: "a1", runs: 0 }));
    const { result } = renderHook(() => useAgentStats("a1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/agents\/a1\/stats$/);

    fetchMock.mockClear();
    const idle = renderHook(() => useAgentStats(null), { wrapper: wrapper() });
    expect(idle.result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
