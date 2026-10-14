import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FileCard } from "./FileCard";
import { FOCUS_FLASH_MS, FOCUS_SETTLE_MS } from "../constants";
import type { PrFile } from "../../../lib/types";
import shell from "../../../../messages/en/shell.json";
import brief from "../../../../messages/en/brief.json";

const patch = "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";
const small: PrFile = { path: "src/config.ts", additions: 2, deletions: 1, patch };
const big: PrFile = { ...small, additions: 500, deletions: 10 };

const scroll = vi.fn();

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, brief }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  scroll.mockClear();
  Element.prototype.scrollIntoView = scroll;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FileCard deep link", () => {
  it("force-opens a collapsed big file and highlights the line for at least 1.5 s", () => {
    const handled = vi.fn();
    const ui = (focus?: { line: number | null; nonce: number }) => (
      <NextIntlClientProvider locale="en" messages={{ shell, brief }}>
        <FileCard file={big} focus={focus} onFocusHandled={handled} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui());
    expect(screen.queryByText("const c = 4;")).not.toBeInTheDocument();
    rerender(ui({ line: 3, nonce: 1 }));

    act(() => {
      vi.advanceTimersByTime(FOCUS_SETTLE_MS + 1);
    });
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
    const row = document.querySelector<HTMLElement>('[data-new-line="3"]')!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain("const c = 4;");
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    expect(row.style.boxShadow).not.toBe("");
    expect(handled).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(row.style.boxShadow).not.toBe("");
    act(() => {
      vi.advanceTimersByTime(FOCUS_FLASH_MS - 1500 + 1);
    });
    expect(row.style.boxShadow).toBe("");
    // deletions carry no new-side line number
    expect(document.querySelectorAll("[data-new-line]")).toHaveLength(3);
  });

  it("scrolls to the header and explains when the line is not rendered", () => {
    renderCard(<FileCard file={small} focus={{ line: 99, nonce: 1 }} />);
    act(() => {
      vi.advanceTimersByTime(FOCUS_SETTLE_MS + 1);
    });
    expect(screen.getByText("Line 99 is outside the changed lines.")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  });

  it("opens and scrolls to the header without a note when no line is given", () => {
    renderCard(<FileCard file={big} focus={{ line: null, nonce: 1 }} />);
    act(() => {
      vi.advanceTimersByTime(FOCUS_SETTLE_MS + 1);
    });
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
    expect(screen.queryByText(/outside the changed lines/)).not.toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
  });
});
