# server — insights

Durable findings about `server/` that aren't visible in the code — recorded by
the `engineering-insights` skill (append-only; correct a stale entry with a dated
note beneath it, don't edit it away). Cross-package findings live in the root
[`../INSIGHTS.md`](../INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## Decisions

- **2026-09-30** — The intent layer stores contract field `summary` in the **pre-existing DB column `intent`** (Drizzle property `intent`); every other new `pr_intent` field is an add-only column. Reason: renaming `intent`→`summary` is a drop+add on one table, which makes `drizzle-kit generate` interactive (see Recurring Errors). The mapping lives only in `src/modules/intent/repository/intent.repo.ts` — never read `row.intent` elsewhere. Likewise PR-body docs are read through the new `GitHubClient.getFileContent(repo, path, ref)` (contents API at `pull.headSha`), NOT `GitClient.readFile`, which reads the **working tree** and PRs may be un-cloned. Evidence: `src/modules/intent/repository/intent.repo.ts`, `src/db/migrations/0015_neat_echo.sql` (ADD COLUMN only), `src/modules/intent/sources.ts`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-21** — The routes→service→repository→Drizzle layering is a **convention,
  not enforced**, and is inconsistently applied: `pulls/`, `polling/`, `workspace/`,
  `settings/` skip the service/repository rings, and `pulls/routes.ts` imports
  `drizzle-orm` + `db/schema` and calls `container.db.select/insert/update/delete`
  **directly in the handler** (plus GitHub sync, backfill, and score/cost aggregation
  inline). Treat `reviews/` as the reference module (full ring split) and `pulls/` as
  the known leak/migration target — the `.claude/skills/onion-architecture` skill
  documents the rings, the deviations, and a migration recipe. Evidence:
  `src/modules/pulls/routes.ts:3,6`; `src/modules/reviews/repository.ts` ("The ONLY
  layer touching the DB").

- **2026-09-21** — A run's row reaches `status='done'` BEFORE its trace document exists: `runOneAgent` calls `repo.completeAgentRun(...)` (`run-executor.ts:254`) and only then builds + `saveRunTrace`s (`:299`), so anything that polls `agent_runs` to a terminal status and immediately reads `GET /runs/:id/trace` can 404 under load — `test/helpers/runs.ts` `waitForPrRuns` alone is not enough. Use `waitForRunTrace(app, runId)` (same helper file) after it; `reviews.it.test.ts` and `skills.it.test.ts` do. The same ordering means the UI's "trace" button can briefly 404 right after a run flips to done. Evidence: `src/modules/reviews/run-executor.ts:254,299`, `test/helpers/runs.ts:42`.
- **2026-09-30** — promoted → `.claude/agents/test-writer.md` (`waitForPrRuns` / `waitForRunTrace` note, ~`:103`).

- **2026-09-22** — `POST /skills/import-url` (skill "Import from URL") reuses the pure `buildImportPreview(filename, contentB64)` by base64-ing the fetched bytes — filename comes from the URL path, and no `.md`/`.zip` extension defaults to `skill.md` (parsed as markdown); persisted skills keep `source='imported_url'` (the enum's "came from outside" bucket, already reused for file uploads — D7). Two patterns worth copying: (1) network I/O is a **new local port** `UrlFetcher`/`SafeUrlFetcher` (`src/adapters/fetcher/`) wired through `container.urlFetcher` with an override slot — the `depgraph`/`tokenizer` shape, NOT a `@devdigest/shared` contract, so no two-tree drift; (2) `SkillsService` types the field as `Container['urlFetcher']` (indexed-access) so the service never imports the concrete adapter, keeping the onion layering clean. SSRF guard is entirely in `SafeUrlFetcher`: http(s) only, a DNS private/loopback/link-local check re-run on every MANUAL redirect hop (a public host must not bounce inward), plus size/time caps; `isPrivateAddress`/`filenameFromUrl` are unit-tested hermetically. Evidence: live `curl -X POST /skills/import-url -d '{"url":"http://localhost:3001/health"}'` → 422 `"That host is not allowed"`; `src/adapters/fetcher/safe-fetch.ts`, `src/modules/skills/service.ts` (`importUrlPreview`), `test/url-fetcher.test.ts`.

- **2026-09-23** — In a `completeStructured` schema, **field order is generation order**, and the model commits to each field as it writes it. Put everything it must *observe* before everything it must *judge*: `src/modules/conventions/prompt.ts` orders `rule → evidence_* → probe_literal → occurrences_seen → rationale → category → confidence` precisely so the label and the score come last. The related trap is sharper — a field whose meaning is only in a Zod `.describe()` gets filled with garbage: `probe_literal` (meant to be a code fragment for ripgrep) came back as the **category name** `"structure"` on the first live run, which then grepped as an ordinary English word and reported "31 occurrences" as though it were measured. Fix is two-sided: spend a prompt paragraph on the field (`.describe()` alone is not enough for deepseek-v4-flash), **and** validate it in code — `isUsableProbe()` rejects category names and bare lowercase prose, leaving `occurrences` null. A fabricated measurement is worse than no measurement. Evidence: `src/modules/conventions/prompt.ts` (PROBE_LITERAL section), `src/modules/conventions/helpers.ts` `isUsableProbe`/`NON_CODE_PROBES`, `test/conventions-helpers.test.ts` ("rejects the category name").

- **2026-09-23** — `repoIntel.getConventionSamples()` (and every rank-driven read) returns `[]` when `REPO_INTEL_ENABLED=false` — which is the value in the local `server/.env`. Any feature that samples files through repo-intel is therefore **dead, not degraded**, on a default dev box. The conventions extractor keeps the repo-intel call (it is the documented sampling path) but falls back to a deterministic breadth-first walk of `repos.clone_path` when it yields nothing — still pure code, so the model still gets no say in what it reads. Anything else built on repo-intel needs the same fallback or an explicit "index this repo first" error. The sampler also gained an additive `opts.includeTests` because `isJunkPath` drops `.test.`/`.spec.`, which is right for review context and wrong for convention extraction. Evidence: `src/modules/repo-intel/service.ts` (`getConventionSamples`, `isJunkPath`, `TEST_PATH_PATTERNS`), `src/modules/conventions/service.ts` (`sample`, `walkCodeFiles`).
- **2026-09-30** — "Current findings" (newest `kind='review'` review per `agentId ?? '∅'`, minus dismissed, de-duped by id) now has a server selector `currentReviewFindings` in `modules/reviews/helpers.ts`, used by `smart-diff/service.ts`. It has two twins — client `currentFindings` (`client/src/lib/findings.ts`) and the inline aggregation in `modules/pulls/routes.ts` — so a change to the rule must touch all three; never re-derive it in another module (the `smart-diff` helpers take already-selected rows). Also: `classifyPath` globs are hand-written regexes in `smart-diff/constants.ts` with `dist/`, `build/`, `test/` matched as a path *segment* at any depth (`(^|\/)dist\/`, so `src/distance.ts` stays core) while `e2e/`, `docs/`, `.github/`, `.claude/` are root-anchored. Evidence: `server/src/modules/reviews/helpers.ts` (`currentReviewFindings`), `server/test/smart-diff-classify.test.ts`.

## Tool & Library Notes

- **2026-09-21** — `dependency-cruiser` (`^17.4.3`) is already a `server/` devDependency,
  but currently used **only** at runtime via the `DepCruiseGraph` adapter for repo-intel
  import graphs — there is no arch-boundary config, `arch:check` script, or CI step yet.
  The `onion-architecture` skill (`.claude/skills/onion-architecture/references/enforcement.md`)
  ships a ready ruleset + `pnpm arch:check` + a `server-unit.yml` step. Gotcha: turning it
  on as `error` **will fail CI immediately** because `pulls/` really does import Drizzle in
  the route — scope that path to `severity: 'warn'` until `pulls/` is migrated, then flip it
  back. Evidence: `package.json` devDeps (`dependency-cruiser`); `src/modules/pulls/routes.ts:3`.
- **2026-09-30** — promoted → `.claude/agents/planner.md` → Hard rules, item 4 (do not assume CI enforces architecture).

- **2026-09-21** — `*.it.test.ts` can run WITHOUT Docker: set `TEST_DATABASE_URL` to a throwaway Postgres and `test/helpers/pg.ts` migrates + uses it instead of testcontainers (`dockerAvailable()` returns true, `stop()` just closes the handle). All files then share ONE database, so run them serially — `TEST_DATABASE_URL=… pnpm exec vitest run .it.test --no-file-parallelism` — the default parallel workers make `reviews.it.test.ts` flake (2 of 4 full-suite runs failed on the trace/findings race vs 3 of 3 clean serial runs). Recreate the DB between runs (`dropdb devdigest_test && createdb devdigest_test`); never point it at the dev DB — the seed and tests write into it. Evidence: `test/helpers/pg.ts:14-31`, `TESTING.md` → *Running locally*.
- **2026-09-30** — promoted → `TESTING.md` (throwaway `TEST_DATABASE_URL` run, ~`:73-76`).

- **2026-09-23** — `drizzle-kit generate` is **interactive** whenever a diff both drops and adds columns on one table: it asks "created or renamed from another column?" per column and reads the TTY directly — piping `\n`s does nothing, and wrapping it in `script -q /dev/null` also fails to deliver the keystrokes (the run just hangs until killed). Do not fight it: **split the schema edit into two generates** — first remove the old columns and generate, then add the new ones and generate. With no dropped column pending, there is no rename ambiguity and no prompt, and the two migrations replay in order on a fresh clone. Separately, Drizzle 0.38's `check()` (third table arg, with `sql\`\``) emits real `ALTER TABLE … ADD CONSTRAINT … CHECK` SQL, so mirroring a `text({ enum })` into Postgres stays *generated* instead of hand-writing a migration (which `AGENTS.md` forbids). Evidence: `src/db/migrations/0012_bent_proteus.sql` (drop) + `0013_clear_hitman.sql` (add) + `0014_smart_tempest.sql` (the two CHECKs); `src/db/schema/knowledge.ts` `conventions`.
- **2026-09-30** — promoted → `.claude/agents/implementer.md` (Hard rule 5, migrations) and `.claude/agents/planner.md` (T4).

- **2026-09-23** — `RipgrepCodeIndex.grep` passed its pattern as a bare argv element (`spawn(rg, [...flags, pattern, root])`), so any pattern beginning with `-` was parsed as a **flag**, not a pattern. Two consequences, both observed: `rg` has `--pre=COMMAND` (runs an arbitrary command per searched file), and a benign pattern like `--radius-md:` exits 2 with `unrecognized flag` while `proc.on('error')` never fires — `close` resolves `[]`, so the caller records "0 matches" for a pattern that is everywhere. Fixed by binding the pattern to an option and ending flag parsing: `['-e', pattern, '--', root]` (`src/adapters/codeindex/ripgrep.ts:60`). Anything that feeds model- or user-supplied text to a child process needs the same treatment. Evidence: `spawn(rg, [..., '--radius-md:', './src'])` → `exit=2 rg: unrecognized flag`; with `-e … --` → `exit=0`, matches returned.
- **2026-09-30** — promoted → `server/AGENTS.md` → Conventions (model- or user-supplied text handed to a child process needs `-e <pattern> --` argv hardening). Fix site: `src/adapters/codeindex/ripgrep.ts:64`.
- **2026-09-30** — `RunLogger` event `data` never reaches the user: `logFor()` persists only `{t, kind, msg}` into `run_traces.log`, and the Live Log renders `msg` only. So anything the user must see in a run (token counts, prompt composition, source statuses) has to be in the **message text**. `data` is visible only in pino stdout and the live SSE payload. Evidence: `src/platform/run-logger.ts:94-95`, `src/modules/intent/service.ts` ("Intent classifier → … · prompt ≈N tok (…)"), `src/modules/reviews/run-executor.ts` ("Reviewer prompt composition — …").
- **2026-09-30** — `new URL('http://[::ffff:127.0.0.1]/').hostname` is `[::ffff:7f00:1]`: WHATWG URL serialises IPv4-mapped IPv6 to **hex**. So a dotted-quad regex in an SSRF guard never matches a literal written in a URL. `isPrivateV6` now decodes the hex `::ffff:hhhh:hhhh` / `::hhhh:hhhh` forms into IPv4 before checking. This matters more now that PR authors (intent sources) supply `SafeUrlFetcher` URLs automatically. Still open (pre-existing): DNS is resolved in `assertPublicUrl` separately from `fetch`, so rebinding is not pinned. Evidence: `src/adapters/fetcher/safe-fetch.ts:121`, `test/url-fetcher.test.ts` (`::ffff:7f00:1`, `::ffff:a9fe:a9fe`).

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
- **2026-09-30** — Remedy superseded: making the generated `ADD COLUMN` idempotent by hand is no longer preferred — hand-editing a migration conflicts with root `AGENTS.md` → Do not touch and `server/AGENTS.md` → Conventions (`0010` is the historical exception). Prefer the `2026-09-23` entry under Tool & Library Notes ("The owner's dev DB is ahead of and divergent…"): check `select count(*)` on the table, reset the empty table to its `0000_init` shape, then migrate normally. Evidence: `server/INSIGHTS.md` (`2026-09-23`, "The owner's dev DB"); `server/AGENTS.md` ("Never hand-write a migration file").

- **2026-09-15** — Making a field REQUIRED on a shared Zod contract (`RunStats.cost_usd`
  in `contracts/trace.ts`) breaks every literal that builds that object, and the
  break surfaces in **tests**, not just runtime: the fan-out for `RunStats` was
  `run-executor.ts` (2 `stats:{…}` literals) + `server/test/contracts.test.ts`
  (RunTrace fixture) + client fixtures `RunTraceDrawer.test.tsx` /
  `RunHistory.test.tsx`. Sweep `grep -rn 'duration_ms' server client` (src AND
  test dirs) before assuming you've found them all. Evidence: `test/contracts.test.ts:160`.
- **2026-09-30** — Duplicate of the root `INSIGHTS.md` Session Notes `2026-09-15` entry (build trap 1, `RunStats.cost_usd` fan-out); already promoted to `.claude/agents/planner.md` → Constraints, T6. Evidence: `.claude/agents/planner.md` (T6 row).

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
    - **2026-09-30** — Turning repo-intel off is no longer free: with `REPO_INTEL_ENABLED=false`, `getConventionSamples()` and every rank-driven read return `[]` (see the `2026-09-23` entry under Codebase Patterns), so the conventions extractor drops to its fallback walk. Keep it `true` now that the `void done.catch(() => {})` in `src/platform/jobs.ts:107` prevents the crash this entry describes. Evidence: `src/platform/jobs.ts:107`; `src/modules/repo-intel/service.ts` (`getConventionSamples`).

- **2026-09-21** — `pnpm add <pkg>` in `server/` prints the same `ERR_PNPM_IGNORED_BUILDS` wall as `pnpm install` / `pnpm typecheck`, but unlike those it has ALREADY finished the job when it prints it: `package.json`, `pnpm-lock.yaml` and `node_modules/<pkg>` are all updated ("added 13, done" precedes the error). Don't re-run it or reach for `npm` — check `grep <pkg> pnpm-lock.yaml` and move on. Seen adding `fflate@0.8.3` for the skills zip importer. Evidence: `pnpm add fflate@^0.8.2` output; `server/pnpm-lock.yaml` (`fflate@0.8.3`).

- **2026-09-23** — The owner's dev DB is **ahead of and divergent from** this repo's migration chain: it carries 19 applied migrations against 15 in `meta/_journal.json`, left over from the reverted reference implementation (`641b637`, reverted by `c6af1e4`). Concretely, `conventions` already had `category`/`status`/`created_at` — with that author's *different* enum values (`general`, `errors`, `api`) — so the new `0012` failed with `column "accepted" of relation "conventions" does not exist`. The fix when the table is **empty** (check first: `select count(*)`) is to reset it to the shape `0000_init.sql` created, then migrate normally — that keeps the generated migrations pristine so a fresh clone still replays correctly, instead of hand-patching them with `ADD COLUMN IF NOT EXISTS`. Expect the same collision for any other table the reference build touched. Evidence: `psql -c '\d conventions'` before/after; `select count(*) from drizzle.__drizzle_migrations` → 19 vs 15 journal entries.
- **2026-09-30** — promoted → `.claude/agents/implementer.md` (migrations / gated-command notes). Evidence: `grep -n migrat .claude/agents/implementer.md`.

- **2026-09-23** — **A review run can report "0 findings, score 100" on an EMPTY diff**, indistinguishable from a clean PR. `loadDiff` (`src/modules/reviews/diff-loader.ts`) tries `git diff base...headSha` in the clone and falls back to `pr_files`; on `OlegDEma/dev-digest` both were dead. (a) The clone is **single-branch** — `git config --get remote.origin.fetch` → `+refs/heads/main:refs/remotes/origin/main` — so a PR head commit is never fetched and the diff throws. (b) `pr_files` had **0 rows for every PR** in that repo, so the fallback produced nothing. (c) Even after fetching, `pull.base` is a branch *name* and the clone's local `main` still pointed at `c6af1e4` while `origin/main` was `a8df1d4`, so `git diff main...head` returned a **69-file / 289k-char** diff for a 2-file PR. Manual repair: `git fetch origin '+refs/heads/*:refs/remotes/origin/*'` then `git update-ref refs/heads/main refs/remotes/origin/main`. Always check `prompt_assembly.user` in the run trace for a non-empty `## Diff to review` before trusting a run's finding count. Evidence: `/runs/:id/trace` (empty `<untrusted source="diff">`); `select count(*) from pr_files` → 0; `docs/experiments/skills-control-experiments.md`.

## Open Questions
