# Engineering Insights — examples

A good/bad pair per section, in DevDigest's own terms. The through-line: **could
someone reading the code figure this out without the note?** If yes, it's noise.
Every ✅ carries an exact symbol/file/limit **and** an exact remedy, plus Evidence.

## Decisions (modules only)

A deliberate choice + why + what was rejected. Not "we use X" — *why X over Y,
here*.

- ❌ `- **2026-09-15** — We use Zod for validation.` — visible in every schema
  file; no decision, no alternative.
- ✅ `- **2026-09-15** — Request and response share ONE Zod schema per contract
  in `@devdigest/shared` — the schema validates the body on the way in and
  serializes on the way out. Rejected separate DTO types: they drift, and the
  server already re-exports the schema to the client via a path alias. Change the
  contract in `vendor/shared` first, then consumers. Evidence:
  `server/src/vendor/shared/contracts/knowledge.ts`.`

## What Works

A non-obvious approach that proved effective.

- ❌ `- **2026-09-15** — Postgres works fine locally.` — says nothing actionable.
- ✅ `- **2026-09-15** — pgvector installs against `postgresql@17`/`@18`, **not**
  `@16`: `brew install postgresql@17 pgvector` symlinks `vector.control`/`.dylib`
  into `@17`'s sharedir, so migration `0000`'s `CREATE EXTENSION vector` runs.
  Installing `@16` leaves the extension absent. Evidence: `docker-compose.yml`
  pins `pgvector/pgvector:pg16` but the DSN only needs *a* reachable pgvector.`

## What Doesn't Work

A failed approach / dead end / antipattern, **with why** — the most-skipped and
most-valuable section.

- ❌ `- **2026-09-15** — Editing shared types is risky.` — vague; no path, no
  mechanism.
- ✅ `- **2026-09-15** — Editing `client/src/vendor/shared/` alone silently
  desyncs the client from the API: it's a hand-copy of the canonical
  `server/src/vendor/shared/` with no sync script, and already lags in 5 files
  (all OpenRouter/CI-runner fields), so the client can't express an
  OpenRouter-backed agent the API accepts. Evidence:
  `diff -rq server/src/vendor/shared client/src/vendor/shared`.`

## Codebase Patterns

A project-specific convention/architecture/naming rule not visible in code.

- ❌ `- **2026-09-15** — The repo has some pre-built scaffolding.` — which? where?
- ✅ `- **2026-09-15** — "Staged for a lesson" scaffolding ships with no module
  behind it: the skills DB tables, `@devdigest/shared` contracts, the
  `## Skills / rules` prompt section, and the whole `messages/en/skills.json`
  namespace all exist with no screen wired to them. Search for existing
  scaffolding before writing any. Evidence: `reviewer-core/src/prompt.ts:109`,
  `client/messages/en/skills.json`.`

## Tool & Library Notes

A quirk/gotcha of a dependency.

- ❌ `- **2026-09-15** — Drizzle can be finicky with migrations.` — folklore.
- ✅ `- **2026-09-15** — Migrations do **not** run on boot; `dev.sh` never calls
  `db:migrate`. A `relation ... does not exist` at startup means the step was
  skipped, not a schema bug — run `cd server && pnpm db:migrate`. Evidence:
  `scripts/dev.sh`, root `CLAUDE.md` Gotchas.`

## Recurring Errors & Fixes

An error seen more than once + the exact fix.

- ❌ `- **2026-09-15** — Sometimes runs get stuck.` — no symptom, no fix.
- ✅ `- **2026-09-15** — A run stuck in `running` after a crash is reaped on next
  server boot (the reaper marks orphaned runs failed) — it's a dead process, not
  a logic bug. Don't chase it in code; restart the server. Evidence: root
  `CLAUDE.md` Gotchas; boot-time reaper.`

## Session Notes (root only)

A dated, cross-package summary of a session's outcome. Use sparingly — only when
the arc spanned packages and matters later.

- ❌ `- **2026-09-15** — Did some work on the reviewer.` — untraceable.
- ✅ `- **2026-09-15** — Wired the skills path end-to-end: `run-executor` now
  passes `skills` into `reviewPullRequest`, so `PromptAssembly.skills` is
  populated and the trace drawer's skills block renders. Touched server + client
  + reviewer-core. Evidence: `server/src/modules/reviews/run-executor.ts`.`

## Open Questions

Something genuinely unresolved that needs follow-up — the honest home for "I saw
something off but couldn't pin it."

- ❌ `- **2026-09-15** — The code could be better.` — not a question.
- ✅ `- **2026-09-15** — Is the client's `vendor/shared` meant to be generated?
  There's no sync script and it lags the server copy — unclear if a codegen step
  was dropped or never existed. Evidence: `diff -rq server/src/vendor/shared
  client/src/vendor/shared`.`

## Correcting an entry (never delete)

When reality moves, nest a dated sub-bullet under the original — don't rewrite it:

```
- **2026-08-05** — No package in this repo has ESLint … Evidence: …
  - **2026-08-05** — Partly stale the same day: `server/` now has `eslint` +
    `typescript-eslint` and a `lint` script, but no config file, so `pnpm lint`
    there fails rather than lints … Evidence: `server/package.json:11,45,50`.
    - **2026-08-05** — Fully resolved for three of four packages: `server/`,
      `client/`, `reviewer-core/` each now have a `lint` script + `eslint.config.mjs`
      … `e2e/` has neither. Evidence: `server/eslint.config.mjs`.
```

The chain stays readable, the history survives, and no one's lesson is silently
overwritten.
