import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BucketBadge } from "./BucketBadge";

afterEach(cleanup);

describe("BucketBadge", () => {
  it("shows the bucket name as text for known and unknown buckets", () => {
    render(
      <>
        <BucketBadge bucket="specs" />
        <BucketBadge bucket="runbooks" />
      </>,
    );
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("runbooks")).toBeInTheDocument();
  });
});
