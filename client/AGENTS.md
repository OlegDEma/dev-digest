# client (`@devdigest/web`) — agent map

## Before touching this module

Read this module's curated docs first — they are the source of truth; this file
only points at them:

- `specs/` — what we intend to build → before implementing a feature here
- `docs/` — how it works today → before changing behavior
- `INSIGHTS.md` — what we already tried & rejected → before debugging or refactoring
- [`README.md`](README.md) — UI route map + data-flow diagram → for the overview

Order: `specs/` → `docs/` → `INSIGHTS.md` → `README.md` → source. Cite them
instead of re-deriving from code. Cross-package findings live in the root
[`../INSIGHTS.md`](../INSIGHTS.md).

## Commands

```sh
pnpm dev          # Next.js dev server, :3000
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest + jsdom, lib/hooks/* mocked (no API or browser needed)
pnpm build        # next build
```

## Conventions (module-local, non-default)

- App Router. Data only via TanStack Query hooks in `src/lib/hooks/*` →
  `src/lib/api.ts`; never `fetch` inside a component.
- Pages are thin; feature logic lives in colocated `_components/<Name>/` folders,
  each with its own `*.test.tsx`.
- User-facing copy lives in `messages/<locale>/*.json` (next-intl) — no hardcoded strings.
- Cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts) in `src/components/app-shell`.

## Gotchas

- **Never run `next build` while `pnpm dev` is running** — both write `.next/`, and
  every route then 500s (`Cannot find module './617.js'`). Stop the dev server,
  `rm -rf client/.next`, rebuild. `pr-self-review`'s gate script runs `next build`,
  so stop the dev server before it too (`client/INSIGHTS.md` → Recurring Errors & Fixes).
- **The kit `Checkbox` has no accessible name in Chromium** (a role-overridden
  `<button>` is not named from its wrapping `<label>`). For a toggle that needs a
  name, use your own `<button role="checkbox" aria-label=…>`, as `BindCheckbox` does
  in `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx`
  (`client/INSIGHTS.md` → Codebase Patterns, 2026-09-21).
- `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) sets the API base used
  by `src/lib/api.ts`.
- Tests mock the `lib/hooks/*` module, so they need neither the API nor a
  browser — the real end-to-end journeys live in
  [`../e2e`](../e2e/README.md).
- `src/vendor/shared` is a hand-copy of the server's canonical copy and **drifts**
  (no sync script) — check the root [`../INSIGHTS.md`](../INSIGHTS.md) before relying on it.

## Do not touch

- `src/vendor/**` — vendored UI primitives (`@devdigest/ui`) and shared contracts
  (`@devdigest/shared`).

## Read when

- Read [`README.md`](README.md) when adding a page or a data hook.
- Read [`../reviewer-core/README.md`](../reviewer-core/README.md) when a change
  touches how findings or scores are produced/rendered.
