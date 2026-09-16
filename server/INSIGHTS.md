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

- **2026-09-16** — With `REPO_INTEL_ENABLED=true` (the `.env` default), running a
  review on the **seeded demo repo `acme/payments-api`** (which does not exist on
  GitHub) makes repo-intel enqueue a background `git clone` that 404s, and the
  `GitError` is **uncaught** → it crashes the whole API process (client then shows
  "Cannot reach the DevDigest engine at http://localhost:3001"). `loadDiff` itself
  is safe (it try/catches and falls back to `diffFromPrFiles` persisted patches),
  so reviews still work without a clone — only the repo-intel index job is fatal.
  Fix for local dev: set `REPO_INTEL_ENABLED=false` in `server/.env` (repo-intel
  can never clone a fake seed repo anyway; reviews degrade to the ripgrep-only /
  persisted-diff path, identical to the repo-intel-off baseline). A fresh fork is
  extra-exposed because it has no `server/clones/`. Deeper bug worth fixing:
  the index/clone job should catch and mark the run failed, not take down the
  server. Evidence: task log `Cloning into '.../clones/acme/payments-api' … remote:
  Repository not found`; `src/modules/repo-intel/service.ts:112` (enqueue),
  `src/modules/reviews/diff-loader.ts:8-26` (safe fallback).
  - **2026-09-16 (real root cause + proper fix)** — Disabling repo-intel only
    dodged ONE trigger; the actual bug is in `JobRunner.enqueue`
    (`src/platform/jobs.ts`): on final failure the queued task records
    `status:'failed'` in the `jobs` row **and re-throws**, so the returned `done`
    promise rejects. Fire-and-forget callers (`repos/service.ts` `add`/`refresh`
    → clone, `:98`/`:117`) never await `done`, so that rejection is **unhandled →
    Node kills the whole API** on ANY failed background job (e.g. cloning the
    seeded fake repo `acme/payments-api`, which 404s). This is why the crash
    recurred even with repo-intel off and clone jobs already marked `failed`. Fix:
    `void done.catch(() => {})` in `enqueue` after scheduling — the failure is
    already persisted, and explicit awaiters still observe the rejection. Verified
    by `POST /repos/:id/refresh` on the fake repo: clone fails, server stays up
    (before the fix it died every time). With this in place `REPO_INTEL_ENABLED`
    can safely go back to `true`. Evidence: `src/platform/jobs.ts` (enqueue
    `done.catch`); `curl -X POST /repos/<acme>/refresh` then `/repos` → 200 ×3.

## Open Questions
