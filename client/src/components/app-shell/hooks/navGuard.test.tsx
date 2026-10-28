import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { registerNavGuard } from "../../../lib/nav-guard";

const push = vi.fn();
const setRepoId = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/repos/a/context" }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "a", repos: [], activeRepo: null, setRepoId }),
}));
vi.mock("../../../lib/hooks", () => ({ usePulls: () => ({ data: [] }), useDeleteRepo: () => ({ mutate: vi.fn() }) }));

import { useShellCommands } from "./useShellCommands";
import { useShellContext } from "./useShellContext";

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  push.mockReset();
  setRepoId.mockReset();
});

function blockWith() {
  let proceed: (() => void) | undefined;
  unregister = registerNavGuard((p) => {
    proceed = p;
    return true;
  });
  return () => proceed!();
}

describe("shell navigation honours the leave guard", () => {
  it("command palette: does not navigate until confirmed", () => {
    const confirm = blockWith();
    const { result } = renderHook(() => useShellCommands());
    act(() => result.current.find((c) => c.id === "agents")!.run());
    expect(push).not.toHaveBeenCalled();
    act(() => confirm());
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("repo switcher: neither switches nor navigates until confirmed", () => {
    const confirm = blockWith();
    const { result } = renderHook(() => useShellContext({ onOpenCommandPalette: vi.fn() }));
    act(() => result.current.onSelectRepo!("b"));
    expect(push).not.toHaveBeenCalled();
    expect(setRepoId).not.toHaveBeenCalled();
    act(() => confirm());
    expect(setRepoId).toHaveBeenCalledWith("b");
    expect(push).toHaveBeenCalledWith("/repos/b/pulls");
  });

  it("navigates directly with no guard registered", () => {
    const { result } = renderHook(() => useShellCommands());
    act(() => result.current.find((c) => c.id === "agents")!.run());
    expect(push).toHaveBeenCalledWith("/agents");
  });
});
