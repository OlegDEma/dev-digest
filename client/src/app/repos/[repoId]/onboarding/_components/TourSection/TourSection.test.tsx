import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { TourSection } from "./TourSection";
import { narrativeTour, renderIntl, skeletonTour } from "../../test-utils";

afterEach(cleanup);

describe("TourSection", () => {
  it("is expanded by default and toggles aria-expanded from its header (AC-15)", () => {
    const tour = narrativeTour();
    renderIntl(
      <TourSection section={tour.sections[1]!} tour={tour}>
        <p>section body</p>
      </TourSection>,
    );
    const toggle = screen.getByRole("button", { name: "Critical paths" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("section body")).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("section body")).not.toBeVisible();
  });

  it("shows the provenance badge as text (AC-16)", () => {
    const tour = narrativeTour();
    renderIntl(
      <>
        <TourSection section={tour.sections[0]!} tour={tour} />
        <TourSection section={tour.sections[2]!} tour={tour} />
      </>,
    );
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText("from index")).toBeInTheDocument();
  });

  it("shows the AC-53 text in a skeleton, with no task rows", () => {
    const tour = skeletonTour("no_clone");
    renderIntl(
      <TourSection section={tour.sections[4]!} tour={tour}>
        <p>task rows</p>
      </TourSection>,
    );
    expect(screen.getByText("First tasks are written by the AI narrative — unavailable in the skeleton.")).toBeInTheDocument();
    expect(screen.queryByText("task rows")).toBeNull();
  });

  it("shows the AC-77 text for a narrative tour with too few tasks, byte-for-byte", () => {
    const tour = narrativeTour();
    const section = { ...tour.sections[4]!, available: false, items: [], provenance: "from_index" as const };
    renderIntl(
      <TourSection section={section} tour={tour}>
        <p>task rows</p>
      </TourSection>,
    );
    expect(
      screen.getByText("Fewer than 3 AI-written first tasks cited files in the index — unavailable for this tour."),
    ).toBeInTheDocument();
    expect(screen.queryByText("task rows")).toBeNull();
  });

  it("falls back to the stored text for an unknown unavailable state", () => {
    const tour = narrativeTour();
    const section = { ...tour.sections[0]!, available: false, unavailable_reason: "stored reason" };
    renderIntl(<TourSection section={section} tour={tour} />);
    expect(screen.getByText("stored reason")).toBeInTheDocument();
  });
});
