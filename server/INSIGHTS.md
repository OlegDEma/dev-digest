# server — insights

Durable findings about `server/` that aren't visible in the code — recorded by
the `engineering-insights` skill (append-only; correct a stale entry with a dated
note beneath it, don't edit it away). Cross-package findings live in the root
[`../INSIGHTS.md`](../INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-15** — `pnpm db:migrate` fails `column "…" already exists` on dev DBs
  provisioned from the full reference schema (this machine's DB carried
  `agent_runs.cost_usd` while the drizzle journal was only at `0009`, so the newly
  generated `0010` tried to re-add it). The DB schema is ahead of the migrations
  journal — not a bug in the new migration. Fix: make the generated `ALTER TABLE …
  ADD COLUMN` idempotent (`ADD COLUMN IF NOT EXISTS`); it records `0010` cleanly on
  the drifted DB and still adds the column on a canonical DB at `0009`. Evidence:
  `src/db/migrations/0010_short_mandrill.sql`; `psql … "SELECT column_name FROM
  information_schema.columns WHERE table_name='agent_runs'"` (column present,
  `agent_runs` = 0 rows). Note: `pnpm db:migrate` also triggers pnpm's
  verify-deps/supply-chain install gate (`ERR_PNPM_IGNORED_BUILDS`); run the tool
  directly — `./node_modules/.bin/tsx src/db/migrate.ts` — to bypass it.

- **2026-09-15** — Making a field REQUIRED on a shared Zod contract (`RunStats.cost_usd`
  in `contracts/trace.ts`) breaks every literal that builds that object, and the
  break surfaces in **tests**, not just runtime: the fan-out for `RunStats` was
  `run-executor.ts` (2 `stats:{…}` literals) + `server/test/contracts.test.ts`
  (RunTrace fixture) + client fixtures `RunTraceDrawer.test.tsx` /
  `RunHistory.test.tsx`. Sweep `grep -rn 'duration_ms' server client` (src AND
  test dirs) before assuming you've found them all. Evidence: `test/contracts.test.ts:160`.

## Open Questions
