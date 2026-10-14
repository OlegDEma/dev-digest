import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const post = vi.fn();
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a), get: vi.fn() } };
});
const error = vi.fn();
vi.mock("../toast", () => ({ notify: { error: (...a: unknown[]) => error(...a), success: vi.fn() } }));

import { ApiError } from "../api";
import { createQueryClient } from "../query-client";
import { useGenerateOnboardingTour } from "./onboarding";

afterEach(() => {
  post.mockReset();
  error.mockReset();
});

function setup() {
  const qc = createQueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useGenerateOnboardingTour("r1"), { wrapper }) };
}

describe("useGenerateOnboardingTour", () => {
  it("refetches the tour after a 409 so polling can start, and raises no global toast (EC-12)", async () => {
    post.mockRejectedValue(new ApiError("busy", 409, "generation_in_progress"));
    const { result, invalidate } = setup();
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["onboarding", "r1"] });
    expect(error).not.toHaveBeenCalled();
  });
});
