# server (`@devdigest/api`) — agent map

## Before touching this module

Read this module's curated docs first — they are the source of truth; this file
only points at them:

- `specs/` — what we intend to build → before implementing a feature here
- `docs/` — how it works today → before changing behavior
- `INSIGHTS.md` — what we already tried & rejected → before debugging or refactoring
- [`README.md`](README.md) — API map + request/DI flow diagram → for the overview

Order: `specs/` → `docs/` → `INSIGHTS.md` → `README.md` → source. Cite them
instead of re-deriving from code. Cross-package findings live in the root
[`../INSIGHTS.md`](../INSIGHTS.md).

## Commands

```sh
pnpm dev                                    # tsx watch, :3001
pnpm typecheck                              # tsc --noEmit
pnpm test                                   # everything
pnpm exec vitest run --exclude '**/*.it.test.ts'   # hermetic units only
pnpm exec vitest run .it.test                      # DB-backed only
pnpm db:generate && pnpm db:migrate         # schema change → migration → apply
pnpm db:seed                                # idempotent demo data
```

## Conventions (module-local, non-default)

- One feature = one `src/modules/<name>/` plugin, registered statically in
  `src/modules/index.ts` (one import + one `app.register`).
- Routes declare Zod `params`/`body`/response schemas from `@devdigest/shared`
  via `fastify-type-provider-zod`. Invalid input is rejected with `422` **before**
  the handler runs — never hand-roll `Schema.parse(req.body)`.
- Plugins (helmet, cors, rate-limit, SSE) register **before** modules so the
  encapsulated module plugins inherit them and the shared error handler.
- External I/O goes through an adapter behind the DI container
  (`src/platform/container.ts`) so tests swap in `src/adapters/mocks.ts`.
- Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate`. Never
  hand-write a migration file.
- Secrets are read only through `LocalSecretsProvider`
  (`src/adapters/secrets/local.ts`). `GITHUB_TOKEN` canonical; `GITHUB_PAT` fallback.

## Gotchas

- Migrations are **not** applied on boot (`relation … does not exist` ⇒ run `pnpm db:migrate`).
- `loadConfig` marks every secret optional — the server boots with no keys; a
  missing key surfaces at call time, not at startup.
- The DB schema already contains every table, including ones no starter code
  writes to. An empty table is expected, not a bug.
- `repo-intel` clones into `server/clones/` — gitignored, and excluded from any search.

## Do not touch

- `server/clones/**` — cloned user repos (incl. a full copy of dev-digest); a grep trap.
- `src/vendor/**` — vendored; `vendor/shared` changes only as a deliberate contract change.

## Read when

- Read [`README.md`](README.md) when adding or changing an API route.
- Read `src/modules/repo-intel/README.md` when touching indexing or the repo map.
- Read [`../TESTING.md`](../TESTING.md) before changing the unit/integration split.
- Run the `engineering-insights` skill at the end of a task to record what was learned.
