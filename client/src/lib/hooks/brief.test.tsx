import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ api }));

import { usePrBrief, useGenerateBrief } from "./brief";

const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe("brief hooks", () => {
  it("AC-34: GET reads the stored brief once and never POSTs", async () => {
    api.get.mockResolvedValue({ brief: null, stale: false });
    const qc = new QueryClient();
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/pulls/p1/brief");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("AC-3/5/33: generation POSTs only on mutate and seeds the cache; it is silent-error", async () => {
    const res = { brief: { summary: "s" }, stale: false };
    api.post.mockResolvedValue(res);
    const qc = new QueryClient();
    const { result } = renderHook(() => useGenerateBrief("p1"), { wrapper: wrap(qc) });
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0]![0]).toBe("/pulls/p1/brief");
    expect(qc.getQueryData(["pull-brief", "p1"])).toEqual(res);
    expect(qc.getMutationCache().getAll()[0]!.meta).toEqual({ silentError: true });
  });
});
