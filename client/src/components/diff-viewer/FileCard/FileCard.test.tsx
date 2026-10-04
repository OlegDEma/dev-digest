import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";
import type { DiffAnnotationApi } from "../annotations";

afterEach(cleanup);

const FILE = {
  path: "src/a.ts",
  additions: 2,
  deletions: 0,
  patch: "@@ -1,2 +1,3 @@\n one\n+two\n three",
};

function api(show: boolean): DiffAnnotationApi {
  return {
    show,
    items: [
      { id: "f1", path: "src/a.ts", line: 2, severity: "CRITICAL" },
      { id: "f2", path: "src/a.ts", line: 40, severity: "WARNING" },
    ],
    render: (id) => <div>card {id}</div>,
  };
}

function renderCard(annotations: DiffAnnotationApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <FileCard file={FILE} annotations={annotations} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard annotations", () => {
  it("shows a named dot, the card under its line, the label and the off-diff block", () => {
    renderCard(api(true));
    expect(screen.getByRole("img", { name: "2 findings in this file" })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    const line = screen.getByText("two");
    const card = screen.getByText("card f1");
    expect(line.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const block = screen.getByText("Findings outside this diff").parentElement!;
    expect(block).toHaveTextContent("card f2");
    expect(block).not.toHaveTextContent("card f1");
  });

  it("labels a warning line 'warning'", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard
          file={FILE}
          annotations={{ show: true, items: [{ id: "w", path: "src/a.ts", line: 2, severity: "WARNING" }], render: () => null }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).toBeNull();
  });

  it("show:false hides both cards but keeps the dot and label", () => {
    renderCard(api(false));
    expect(screen.queryByText("card f1")).toBeNull();
    expect(screen.queryByText("card f2")).toBeNull();
    expect(screen.getByRole("img", { name: /findings in this file/ })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });
});
