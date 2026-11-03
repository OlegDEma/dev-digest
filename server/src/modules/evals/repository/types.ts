import type * as t from '../../../db/schema.js';

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;
export type EvalCaseResultRow = typeof t.evalCaseResults.$inferSelect;
