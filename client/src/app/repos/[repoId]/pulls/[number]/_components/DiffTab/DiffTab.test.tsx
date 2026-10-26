import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DiffTab } from "./DiffTab";
import type { PrFile } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import brief from "../../../../../../../../messages/en/brief.json";

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

const patch = "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";
const files: PrFile[] = [
  { path: "src/config.ts", additions: 2, deletions: 1, patch },
  { path: "src/other.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+export const z = 1;" },
];

function renderTab(target?: { path: string; line: number | null; nonce: number }, onHandled = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ shell, brief }}>
      <DiffTab prId="p1" filesCount={2} files={files} target={target} onTargetHandled={onHandled} />
    </NextIntlClientProvider>,
  );
  return onHandled;
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DiffTab deep link", () => {
  it("highlights the line in the exactly matching file and clears the target once", () => {
    const handled = renderTab({ path: "src/config.ts", line: 3, nonce: 1 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelectorAll('[data-new-line="3"]').length).toBeGreaterThan(0);
    expect(screen.queryByText("File not in this PR’s diff")).not.toBeInTheDocument();
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it.each(["../../etc/passwd", "src/config.ts ", "SRC/config.ts"])(
    "shows the message and leaves the diff unchanged for %j",
    (path) => {
      const handled = renderTab({ path, line: 3, nonce: 1 });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("File not in this PR’s diff")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts")).toBeInTheDocument();
      expect(screen.getByText("src/other.ts")).toBeInTheDocument();
      expect(document.querySelector("[data-new-line]")).not.toBeNull();
      expect(handled).toHaveBeenCalledTimes(1);
    },
  );
});
