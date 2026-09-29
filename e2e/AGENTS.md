# e2e (`@devdigest/e2e`) — agent map

## Before touching this module

Read this module's curated docs first — they are the source of truth; this file
only points at them:

- `specs/` — ⚠️ here this holds `*.flow.json` **browser-flow definitions**, NOT
  feature specs (feature specs live in the root [`../specs/`](../specs/))
- `docs/` — how it works today → before changing behavior
- `INSIGHTS.md` — what we already tried & rejected → before debugging a flow
- [`README.md`](README.md) — how a flow works + the coverage table → for the overview

Order: `docs/` → `INSIGHTS.md` → `README.md` → `specs/*.flow.json` → source. Cite
them instead of re-deriving from code.

## Commands (⚠️ npm, not pnpm)

```sh
npm run e2e:hermetic   # isolated, freshly-seeded stack on alt ports (recommended)
npm test               # run flows against an already-running stack
```

## Conventions (module-local, non-default)

- Flows run on Vercel **agent-browser** (Rust + CDP) — **no Playwright, no LLM,
  no API key**. Each flow is a JSON list of commands in `specs/NN-name.flow.json`,
  run in order against one shared session by `run.ts`.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`); the
  AI `chat` command is never used, so runs are stable and key-free.
- `wait --text` / `wait --url` **are** the assertions — a non-zero exit fails the step.

## Gotchas

- **Precondition: exactly one seeded repo.** Flows 02/04/05 follow the home
  redirect to the *first* repo, so a dev DB with extra repos makes them land on
  the wrong one. Use the hermetic runner — it spins up its own seeded stack and
  leaves your dev DB untouched.
- The hermetic runner needs **Docker** (`E2E_PG_IMAGE=pgvector/pgvector:pg16`).
- ⚠️ **Never `docker compose down -v`** to reset — `-v` destroys `devdigest_pgdata`
  and every imported repo/review with it.
- Failure screenshots land in `test-results/` (gitignored).

## Read when

- Read [`README.md`](README.md) before writing or debugging a browser flow.
- Read [`../client/README.md`](../client/README.md) when a UI change breaks a
  flow's locators.
