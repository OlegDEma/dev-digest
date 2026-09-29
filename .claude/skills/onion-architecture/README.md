# Onion Architecture (skill)

Keeps devDigest's backend on an **onion**: business meaning in the center, I/O on
the rim, every dependency pointing inward. The layers already exist in the code —
this skill makes the boundaries explicit and enforces them so they don't erode.
It is the backend counterpart to `frontend-ui-architecture`.

## When it applies

Backend only: `server/` and `reviewer-core/`. It triggers when you create or
refactor a route, service, repository, or adapter; when you're deciding where a
piece of logic, a DB query, or an external call belongs; or when reviewing whether
a module leaks infrastructure into its core.

It is **not** about how to write the code inside a ring — for that, defer to
`fastify-best-practices`, `drizzle-orm-patterns`, `zod`, and `typescript-expert`.
This skill owns only the **boundaries between rings**.

## What's here

| File | Purpose |
| --- | --- |
| [`SKILL.md`](SKILL.md) | The brain: the five rings mapped to our files, the seven rules, the "where does this go?" decision path. Loads on trigger. |
| [`references/layermap.md`](references/layermap.md) | Every ring mapped to real paths; the `reviews/` reference module; the deviations we're paying down. |
| [`references/enforcement.md`](references/enforcement.md) | The dependency-cruiser ruleset, CI wiring (`pnpm arch:check`), grep checks, and the migrate-a-leaky-module recipe. |
| [`references/examples.md`](references/examples.md) | Good vs. bad on our own modules (`reviews/` ✅ vs. `pulls/` ❌). |
| [`references/sources.md`](references/sources.md) | Why each rule holds + the full reading list. |

## The rules, in one breath

1. Dependencies point inward — always. 2. Drizzle only in repositories. 3. External
I/O only through a container port. 4. Zod validation at the rim. 5. Logic not in the
route, not in the repository. 6. Contracts change in `@devdigest/shared` first.
7. A thin module is a decision, not laziness.

## Enforcement at a glance

```bash
cd server && pnpm arch:check   # dependency-cruiser, also runs in CI (server-unit.yml)
```

Boundaries are checked with dependency-cruiser (already a dep). A deliberate new
crossing updates the ruleset in the same PR — never a blanket ignore. Full setup
and the current `pulls/` exception in [`references/enforcement.md`](references/enforcement.md).
