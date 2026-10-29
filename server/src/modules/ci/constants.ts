/** Branch the generated CI files are committed to. */
export const CI_BRANCH = 'devdigest/ci';
export const CI_PR_TITLE = 'Add DevDigest CI review';
/** Fixed workflow path; the refresh ingest lists runs of this file. */
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const WORKFLOW_FILE = 'devdigest-review.yml';
export const ARTIFACT_NAME = 'devdigest-result';
/** Entry inside the artifact zip the runner writes. */
export const RESULT_FILE = 'devdigest-result.json';
/** How far back the refresh looks for workflow runs (Q-17). */
export const INGEST_WINDOW_DAYS = 30;
export const RUNS_LIMIT = 100;
/** Hard caps on what we accept from an artifact (untrusted input). */
export const MAX_ZIP_BYTES = 1_000_000;
export const MAX_RESULT_BYTES = 100_000;
/** `pull_request` activity types GitHub accepts for `on.pull_request.types`. */
export const PR_TRIGGER_TYPES = [
  'assigned',
  'unassigned',
  'labeled',
  'unlabeled',
  'opened',
  'edited',
  'closed',
  'reopened',
  'synchronize',
  'converted_to_draft',
  'ready_for_review',
  'locked',
  'unlocked',
  'review_requested',
  'review_request_removed',
  'auto_merge_enabled',
  'auto_merge_disabled',
  'enqueued',
  'dequeued',
] as const;
