import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseInputFile } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";
import { FilesTab } from "./FilesTab";

afterEach(cleanup);

const seen: EvalCaseInputFile[][] = [];
function Harness({ initial }: { initial: EvalCaseInputFile[] }) {
  const [files, setFiles] = React.useState(initial);
  return (
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <FilesTab
        files={files}
        diffPaths={new Set()}
        problem={null}
        onChange={(next) => {
          seen.push(next);
          setFiles(next);
        }}
      />
    </NextIntlClientProvider>
  );
}

describe("FilesTab row identity", () => {
  it("removing the first file keeps the second file's DOM node, and no row id leaks into the files", () => {
    seen.length = 0;
    render(<Harness initial={[{ path: "a.ts", content: "A" }, { path: "b.ts", content: "B" }]} />);
    const second = screen.getAllByLabelText("File path")[1]!;
    expect(second).toHaveValue("b.ts");
    fireEvent.click(screen.getByRole("button", { name: /Remove file a\.ts/ }));
    const remaining = screen.getAllByLabelText("File path");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(second);
    expect(seen[0]).toEqual([{ path: "b.ts", content: "B" }]);
    expect(Object.keys(seen[0]![0]!).sort()).toEqual(["content", "path"]);
  });
});
