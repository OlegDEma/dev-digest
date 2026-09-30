# DevDigest — agent map

## Before answering

Before answering any question or starting any task, FIRST search the relevant
package's `docs/`, `specs/` and `INSIGHTS.md` for what was asked about. These are
curated and may already answer it in full. Only after that, read the code.

Order: `<module>/specs/` (what we intend to build) → `<module>/docs/` (how it
works) → `<module>/INSIGHTS.md` (what we already tried and rejected) → source.
If a curated file answers the question, cite it instead of re-deriving from code.

## After finishing

Run the `engineering-insights` skill at the end of any non-trivial task. It
records what was learned into the `INSIGHTS.md` of the module you touched, after
checking that a similar entry isn't already there. **Do not skip this step.**

Skip only the writing, and only when nothing non-obvious came up — a typo or a
routine change is not an insight, and noise costs more than silence.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript · Fastify 5 · Next.js 15 / React 19 ·
Drizzle ORM + Postgres (pgvector) · Zod · Vitest · agent-browser (e2e)

## Commands

| Task            | Command                                                    |
| --------------- | ---------------------------------------------------------- |
| Boot everything | `./scripts/dev.sh` (Postgres + API :3001 + web :3000)      |
| Server          | `cd server && pnpm dev \| build \| typecheck \| test`      |
| Migrations      | `cd server && pnpm db:generate` then `pnpm db:migrate`     |
| Client          | `cd client && pnpm dev \| build \| typecheck \| test`      |
| Engine          | `cd reviewer-core && npm test \| npm run typecheck`        |
| E2E (hermetic)  | `cd e2e && npm run e2e:hermetic`                            |

Flags for `dev.sh`: `--no-seed` · `--no-client` · `--db-only` · `--help`.

## Where things live

| Path                        | What                                                     |
| --------------------------- | -------------------------------------------------------- |
| `server/`                   | Fastify API + Drizzle. Indexer at `src/modules/repo-intel/` |
| `client/`                   | Next.js studio, App Router                                |
| `reviewer-core/`            | Pure engine: diff + repo map → prompt → LLM → findings    |
| `e2e/`                      | Deterministic browser flows, no LLM                       |
| `server/src/vendor/shared/` | `@devdigest/shared` — Zod contracts for every package     |
| `client/src/vendor/ui/`     | `@devdigest/ui` — vendored UI primitives                  |

## Per-module agent maps

This repo follows the **`AGENTS.md`** convention: every agent map is an
`AGENTS.md`, and the `CLAUDE.md` beside it is a one-line `@AGENTS.md` import kept
for tools that still look for that name.

Module-local commands, conventions and gotchas live in each package's own
`AGENTS.md` (auto-loaded when you work in that folder), not here —
[`server/`](server/AGENTS.md) · [`client/`](client/AGENTS.md) ·
[`reviewer-core/`](reviewer-core/AGENTS.md) · [`e2e/`](e2e/AGENTS.md). Each points
at that module's `README.md` · `docs/` · `specs/` · `INSIGHTS.md` — link, never copy.

## Conventions (non-default — you cannot infer these from the code)

- **Not a monorepo workspace.** Each package has its own `package.json` and its
  own lockfile. `server/` + `client/` use **pnpm**; `reviewer-core/` + `e2e/` use
  **npm**. Never run the wrong package manager in a package.
- Cross-package imports resolve through **tsconfig path aliases**, not published
  modules. `reviewer-core` is consumed as TypeScript **source** and never emits
  JS — its `build` is a typecheck.
- Contracts change in `@devdigest/shared` **first**, then in consumers. The same
  Zod schema drives request validation and response serialization.
- Server tests split by filename: `*.it.test.ts` are DB-backed (testcontainers
  Postgres). Everything else must stay hermetic.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600) with `process.env` as
  fallback — never in git or the database.
- **`pnpm typecheck` / `pnpm install` / `pnpm db:migrate` trip a supply-chain
  build gate.** In `server/` + `client/` these abort with
  `ERR_PNPM_IGNORED_BUILDS` before doing any work — run the tool binary directly
  instead: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`,
  `./node_modules/.bin/tsx src/db/migrate.ts`. Evidence: `server/INSIGHTS.md`
  → *Recurring Errors & Fixes*.
- **CI is per-package (5 workflows); server tests run as two jobs.**
  `.github/workflows/`: `server-unit.yml` (hermetic) and `server-integration.yml`
  (`*.it.test.ts`, testcontainers Postgres, self-skips without Docker), plus
  `client.yml`, `reviewer-core.yml`, `e2e-web.yml`. There is no root/aggregate
  workflow. Evidence: `.github/workflows/`.

### Naming

- **Contract fields are `snake_case`; Drizzle is a `camelCase` property → a
  `snake_case` column.** `@devdigest/shared` contracts (and the JSON the API
  returns) use snake_case — `cost_usd`, `findings_by_severity`, `run_id`,
  `start_line`; the Drizzle schema names a camelCase property mapped to a
  snake_case column: `costUsd: doublePrecision('cost_usd')`,
  `startLine: integer('start_line')`. The repo/route layer maps between the two
  (`run.costUsd` → `cost_usd`). Mixing the two casings is the single most common
  bug when you add a field. Evidence: `server/src/db/schema/*.ts`,
  `server/src/modules/*/repository/*.ts`.
- **Enum casing is per-enum, not uniform.** `Severity` is UPPERCASE
  (`CRITICAL | WARNING | SUGGESTION`), `FindingCategory` is lowercase
  (`bug | security | perf | style | test`); both persist as plain `text`, so the
  Zod enum is the only guard — a wrong-case value fails validation, not the DB.
  Evidence: `*/vendor/shared/contracts/findings.ts`.
- **Contracts live in two hand-copied trees that drift.** Every schema exists in
  BOTH `server/src/vendor/shared/` (canonical) and `client/src/vendor/shared/`
  (copy) with no sync script — edit both, identically, in the same change.
  Evidence: root [`INSIGHTS.md`](INSIGHTS.md) → *What Doesn't Work* (2026-07-29).
- **Specs are `NN-slug.md` (2-digit prefix), written before the code.** Root
  `specs/` for a feature spanning ≥2 packages; `<pkg>/specs/` for a single-package
  one. Evidence: `specs/README.md`, `specs/01-run-cost-badge.md`.
- **Commits follow Conventional Commits by example** (`feat(reviews): …`,
  `fix(db): …`, `docs(insights): …`) — matched from history, not enforced by a
  hook; branch names are freeform.
- Client feature-folder naming (`_components/<PascalName>/` + `<Name>.test.tsx` +
  `index.ts`) is documented in [`client/AGENTS.md`](client/AGENTS.md) — not
  repeated here.

## Gotchas

- **Migrations do not run on boot.** `relation ... does not exist` means you
  skipped `pnpm db:migrate`.
- **Never `docker compose down -v`** to "reset" — `-v` destroys the
  `devdigest_pgdata` volume and every imported repo and review with it.
- The server reaps orphaned `running` runs on boot; a run stuck in `running` is
  usually a crashed process, not a logic bug.

## Do not touch

- `server/clones/**` — cloned user repos, including a full copy of dev-digest
  itself. **Always exclude it from grep and glob** or you will read and edit the
  wrong file. Gitignored; never commit its contents.
- `.claude/worktrees/**` — local Claude Code worktrees, each a full, stale copy
  of the repo (extra `INSIGHTS.md` files, agents, specs). **Always exclude it
  from grep and glob.** A default `rg` skips it (a hidden directory), but `find`,
  `ls`, `Read` by path and `rg --hidden --no-ignore` do not. Listed in
  `.git/info/exclude`; never commit its contents.
- `**/src/vendor/**` — vendored. Exception: `vendor/shared` changes only as part
  of a deliberate contract change.
- `**/node_modules/**`, `pnpm-lock.yaml`, `package-lock.json`.
- `server/src/db/migrations/**` — **generated, do not hand-edit or hand-write.**
  Change `server/src/db/schema.ts`, then `cd server && pnpm db:generate` to emit
  the migration, and `pnpm db:migrate` to apply it.

## Read when

- Read `TESTING.md` when adding a test or touching CI.
- Read `docs/agent-prompts/` when changing a built-in agent's prompt or model.
- Read a package's own `AGENTS.md` (above) when you start working inside it.
- Read `INSIGHTS.md` at repo root for decisions that span more than one package.
- Use the `engineering-insights` skill to read or record an insight — it maps a
  touched path to the right `INSIGHTS.md` and holds the format and quality bar.
