import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInvalidateOnRunsSettled } from "./reviews";

function setup(initial: { prId: string | null; count: number }) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook((p: { prId: string | null; count: number }) => useInvalidateOnRunsSettled(p.prId, p.count), {
    wrapper,
    initialProps: initial,
  });
  return { spy, hook };
}

describe("useInvalidateOnRunsSettled", () => {
  it("1 → 0 invalidates reviews and smart-diff exactly once", () => {
    const { spy, hook } = setup({ prId: "p1", count: 1 });
    expect(spy).not.toHaveBeenCalled();
    hook.rerender({ prId: "p1", count: 0 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "p1"] });
    hook.rerender({ prId: "p1", count: 0 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("0 → 0 and 0 → 1 do nothing", () => {
    const { spy, hook } = setup({ prId: "p1", count: 0 });
    hook.rerender({ prId: "p1", count: 0 });
    hook.rerender({ prId: "p1", count: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does nothing without a prId", () => {
    const { spy, hook } = setup({ prId: null, count: 1 });
    hook.rerender({ prId: null, count: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});
