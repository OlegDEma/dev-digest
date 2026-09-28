import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const createMutate = vi.fn();
const urlPreviewMutate = vi.fn();
const filePreviewMutate = vi.fn();
const push = vi.fn();

const URL_PREVIEW: SkillImportPreview = {
  filename: "SKILL.md",
  name: "route-versioning",
  description: "Version routes safely",
  type: "convention",
  body: "# Route versioning\n\nAlways add, never change.",
  source: "imported_url",
  core_entry: "SKILL.md",
  ignored_entries: [],
  warnings: [],
};

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: filePreviewMutate, isPending: false }),
  useImportSkillUrlPreview: () => ({ mutateAsync: urlPreviewMutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  createMutate.mockReset();
  urlPreviewMutate.mockReset();
  filePreviewMutate.mockReset();
  push.mockReset();
});

function renderModal() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <CreateSkillModal onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

describe("CreateSkillModal", () => {
  it("shows the three tabs and opens on Create", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "From file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import from URL" })).toBeInTheDocument();
    // Create tab is active: the from-scratch form is visible.
    expect(screen.getByPlaceholderText("no-then-chains")).toBeInTheDocument();
  });

  it("creates from scratch with the typed fields (name falls back to the default) and opens the editor", () => {
    const { onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("no-then-chains"), { target: { value: "  my-skill " } });
    fireEvent.change(screen.getByPlaceholderText(/Flag promise/), { target: { value: "Flag X." } });
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]![0]).toMatchObject({ name: "my-skill", description: "Flag X.", type: "custom" });
    expect((createMutate.mock.calls[0]![0] as { body: string }).body).toContain("# Rule");
    const opts = createMutate.mock.calls[0]![1] as { onSuccess: (s: unknown) => void };
    act(() => opts.onSuccess({ id: "new-id", name: "my-skill" }));
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/new-id?tab=config");
  });

  it("blocks an empty body on the Create tab", () => {
    renderModal();
    const body = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("imports from a URL: fetch → preview → confirm persists the parsed draft", async () => {
    urlPreviewMutate.mockResolvedValue(URL_PREVIEW);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    fireEvent.change(screen.getByPlaceholderText(/raw\.githubusercontent/), {
      target: { value: "https://example.com/SKILL.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch skill" }));
    expect(urlPreviewMutate).toHaveBeenCalledWith({ url: "https://example.com/SKILL.md" });
    // The preview renders with the parsed name; confirming persists it.
    expect(await screen.findByDisplayValue("route-versioning")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Import skill/ }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      name: "route-versioning",
      description: "Version routes safely",
      type: "convention",
      source: "imported_url",
    });
  });
});
