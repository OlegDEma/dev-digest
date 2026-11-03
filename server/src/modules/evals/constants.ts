/** Max length of an eval case name (slug), including any `-N` clash suffix (AC-4a). */
export const EVAL_CASE_NAME_MAX = 60;

/** Eval cases reviewed in parallel inside one run (NFR-3). */
export const EVAL_CONCURRENCY = 4;

/** Rows returned by the history and dashboard lists (AC-46a, AC-57). */
export const EVAL_HISTORY_LIMIT = 50;
export const EVAL_RECENT_LIMIT = 20;

export const EVAL_RESTART_ERROR = 'server restarted during run';

/** Cap on eval cases per agent; keeps runs and the list bounded (spec NFR-1: 200). */
export const MAX_EVAL_CASES_PER_AGENT = 200;

/** Retries when a concurrent creation takes the same case name (AC-4b). */
export const EVAL_NAME_RETRIES = 5;

/** Batch ("Run all agents") runs executing at once; the rest stay `queued` (AC-D79). */
export const EVAL_BATCH_CONCURRENCY = 2;

/** Runs listed on the per-agent page (AC-D66). */
export const EVAL_AGENT_RUNS_LIMIT = 50;

/** Points of an agent row's sparkline (AC-D61). */
export const EVAL_SPARKLINE_POINTS = 10;

export const EVAL_RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

/** Error of a case whose stored diff has no reviewable file at run time (AC-D47). */
export const EVAL_EMPTY_DIFF_ERROR = 'diff has no reviewable files';

/** `EvalExpectedItem.title` max (UTF-16 code units, as `z.string().max`). */
export const EVAL_ITEM_TITLE_MAX = 200;
