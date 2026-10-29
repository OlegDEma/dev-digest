import type { CiPostAs } from "@devdigest/shared";

export const TRIGGER_OPTIONS = ["opened", "synchronize", "reopened"] as const;

/** `post_as` value → key under `ci.exportWizard.postAs`. */
export const POST_AS_OPTIONS: ReadonlyArray<{ value: CiPostAs; key: string }> = [
  { value: "github_review", key: "githubReview" },
  { value: "pr_comment", key: "prComment" },
  { value: "none", key: "none" },
];
