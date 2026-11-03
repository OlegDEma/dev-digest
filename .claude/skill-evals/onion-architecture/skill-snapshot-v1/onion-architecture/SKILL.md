---
name: onion-architecture
description: >-
  Enforce Onion / hexagonal architecture in devDigest backend code. Use whenever
  creating or refactoring anything under server/src/modules/, server/src/adapters/,
  server/src/platform/, or reviewer-core/ — adding a route/service/repository/adapter,
  deciding where business logic, DB access, or external I/O belongs, or judging
  whether a module leaks infrastructure into its core. The rule is one-directional:
  dependencies point inward, the domain core (reviewer-core) knows nothing outward,
  Drizzle lives only in repositories, and external I/O only enters through a port on
  the DI container. Trigger terms: onion architecture, hexagonal, ports and adapters,
  layering, dependency direction, where should this logic go, route touching the DB,
  service new-ing an SDK client, dependency-cruiser, arch:check.
metadata:
  tags: architecture, onion, hexagonal, layering, backend, ports-adapters, dependency-cruiser, workflow
---

# Onion Architecture

DevDigest's backend is an **onion**: business meaning sits in the center, I/O sits
on the rim, and **every dependency points inward**. The layers already exist in
the code — this skill makes the boundaries explicit and keeps them from eroding.

We do **not** use a DI-container library (no NestJS / InversifyJS / tsyringe).
Inversion is hand-rolled: a `Container` with lazy getters passes port interfaces
into services (`server/src/platform/container.ts`). So the onion here is enforced
by **import discipline**, not decorators — which is exactly why it needs a skill.

## The five rings, mapped to our files

From center (most stable, pure) to rim (most volatile, I/O):

| Ring | In our code | May import | Must NOT import |
| --- | --- | --- | --- |
| **Domain** (core) | `reviewer-core/`, domain types in `@devdigest/shared` | nothing outward; only injected port interfaces | Drizzle, Fastify, `adapters/`, `db/`, any `server/` code |
| **Application** | `modules/*/service.ts`, `run-executor.ts` | domain, port interfaces (`@devdigest/shared`), its own repository | Fastify (`req`/`reply`), concrete adapters, SDK clients |
| **Data access** | `modules/*/repository.ts`, `repository/*.repo.ts` | `drizzle-orm`, `db/schema`, domain types | Fastify, service, other modules' internals |
| **Infrastructure** | `platform/`, `adapters/`, `db/` | anything inward (it *implements* the ports) | — (this is the rim) |
| **Presentation** | `modules/*/routes.ts` | its service, Zod contracts | `drizzle-orm` / `db` directly ⚠️ |

The arrows only ever point left-to-right in that table (rim → center). The
domain never reaches out; the rim reaches all the way in. See
[`references/layermap.md`](references/layermap.md) for the full per-file breakdown
and the known deviations we are paying down.

## The seven rules

1. **Dependencies point inward — always.** An outer ring may depend on any inner
   ring; an inner ring may never name an outer one. The domain (`reviewer-core`)
   is the center and imports nothing from `server/`.

2. **Drizzle lives only in `repository/*.repo.ts`.** If a `routes.ts` or
   `service.ts` imports `drizzle-orm` or `db/schema`, that is a leak — the
   query belongs in a repository. (This is the `pulls/` deviation; see
   [`references/examples.md`](references/examples.md).)

3. **External I/O enters only through a port on the container.** A service never
   does `new AnthropicClient()` / `new Octokit()`. It calls `container.llm(id)`,
   `container.github()`, `container.git`, `container.repoIntel`. The **port
   interface** lives in `@devdigest/shared`; the **implementation** lives in
   `adapters/`; they are wired in `platform/container.ts`. This is what makes
   `ContainerOverrides` test injection possible — depend on interfaces, not
   concretions.

4. **Zod validation happens at the rim (presentation).** Routes declare
   `params`/`body`/response schemas from `@devdigest/shared` via
   `fastify-type-provider-zod`; invalid input is rejected `422` *before* the
   handler. Never hand-roll `Schema.parse(req.body)` (tolerant parses of an
   optional body are the only documented exception).

5. **Business logic is not in the route and not in the repository.**
   Orchestration (tenancy, run creation, transactions, fire-and-forget) lives in
   `service.ts`; the *pure* algorithm (prompt → LLM → grounding → reduce) lives
   in `reviewer-core`. Routes translate HTTP; repositories translate rows.

6. **Contracts change in `@devdigest/shared` first, then consumers.** The same
   Zod schema drives request validation and response serialization. Extend with
   new files; do not edit existing contracts casually — a required-field change
   fans out across server, tests, and client (see `server/INSIGHTS.md`).

7. **A thin module is a decision, not laziness.** Skipping `service`/`repository`
   is allowed only when a module is a pure read/proxy with no orchestration and
   no persistence of its own. The moment it writes to the DB or coordinates more
   than one call, it earns the full split. Record the choice; don't drift into it.

## "Where does this code go?" — decision path

```
Is it a pure business rule / algorithm with no I/O?
  → reviewer-core/ (domain).  Inject any side effect (e.g. LLMProvider) as a port.

Does it read/write the database?
  → a repository (modules/<name>/repository/*.repo.ts). Nowhere else.

Does it talk to GitHub / an LLM / git / the filesystem?
  → define a port interface in @devdigest/shared, implement it in adapters/,
    wire it in platform/container.ts, and consume it via the container.

Does it coordinate several of the above for one use case (tenancy, ordering,
transactions, background jobs)?
  → a service (modules/<name>/service.ts) or an extracted executor.

Is it parsing/shaping HTTP request & response, SSE, status codes?
  → the route (modules/<name>/routes.ts) — and only there.

Is it a pure row→DTO / value transform?
  → helpers.ts (no side effects, no Drizzle handle).
```

When two rings both seem plausible, choose the **more inward** home that still
compiles without importing outward — that is almost always correct.

## How this is enforced

Import discipline is checked automatically with **dependency-cruiser** (already a
dep, used elsewhere for import graphs) wired into CI as `pnpm arch:check`. The
ruleset, the manual `grep` fallbacks, and the step-by-step recipe for
un-leaking a module are in [`references/enforcement.md`](references/enforcement.md).
When you add a new ring-crossing on purpose, update the ruleset in the same PR —
don't silence it.

## Companion files

- [`references/layermap.md`](references/layermap.md) — every ring mapped to real
  paths; the `reviews/` reference module; the current deviations (`pulls/`,
  `polling/`, `workspace/`, `settings/`).
- [`references/enforcement.md`](references/enforcement.md) — the dependency-cruiser
  ruleset, CI wiring, `grep` checks, and the "migrate a leaky module" recipe.
- [`references/examples.md`](references/examples.md) — good vs. bad on our own modules.
- [`references/sources.md`](references/sources.md) — why each rule holds + the reading list.
- [`README.md`](README.md) — orientation for humans.

## Relationship to other skills

This skill is about the **boundaries between rings**, not how to write the code
inside one. For the craft inside a ring, defer to: `fastify-best-practices`
(routes/plugins), `drizzle-orm-patterns` (repository queries), `zod` (contract
shapes), `typescript-expert` (types). Its frontend counterpart is
`frontend-ui-architecture` (client structure). Run `engineering-insights` after
any non-trivial change here to record what moved and why.
