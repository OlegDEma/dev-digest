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
