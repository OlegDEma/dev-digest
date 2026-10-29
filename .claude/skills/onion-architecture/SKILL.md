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

## The ten rules

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

8. **Deferred, scheduled and cross-module work enters through the job port.**
   Time and "later" are I/O too. `container.jobs` (`platform/jobs.ts`,
   `JobRunner`) is the port for them: it persists a `jobs` row, retries with
   backoff and records the failure. So inside `modules/`:
   - **No timers.** No `setInterval` / `setTimeout` / cron library to schedule
     work or to retry a failed call. A recurring task is a registered job kind
     triggered by the platform; a retry is the JobRunner's, not a hand-rolled
     `setTimeout(() => this.again(), …)`. In-process timers vanish on restart,
     run once per API instance, and hide failures. *Not* covered: a timer that
     only bounds an awaited call (a deadline raced against a promise and
     cleared in `finally`) — nothing is scheduled, the caller still awaits.
   - **No module calls another module's service to react to an event.** When
     module A finishing something should make module B act ("PR synced →
     start an auto-review"), A enqueues a job kind and B registers its handler
     (`container.jobs.register` in B's service, as `repos/service.ts`
     `registerCloneJobHandler` does). A never imports B's `service.ts`; that
     edge is how module cycles start.
   - **No swallowed fire-and-forget for work that must happen.** `void x().catch(() => {})`
     on a side effect someone relies on (a webhook, an email, a status update) loses it
     silently; enqueue it. The sanctioned exception is a **review run on the run
     executor** (`reviews/service.ts` → `run-executor`, and any other entry
     point that starts the same executor): its `agent_runs` row is created
     *before* the fire, the `.catch` records the failure on that row instead of
     swallowing it, and stale `running` rows are reaped on boot. That trio —
     durable row first, failure recorded, reaper — is what makes it safe; do
     not flag it, and do not copy the pattern without all three. The **eval-run
     executor** is sanctioned on the same terms (`evals/service.ts` →
     `evals/executor.ts`): its `eval_runs` row is inserted `running` *before*
     the fire, the `.catch` writes `failed` + the message onto that row, and
     `app.ts` reaps stale `running` rows on boot (`EvalService.reapStaleRuns`).

9. **A module's `index.ts` is its public API, not a back door.** Crossing into
   another module through its barrel is allowed only for what that module
   *chooses* to publish: its service/facade class, its port-shaped types, its
   job-kind constants. A barrel must not re-export data access — no
   `export * from './repository…'`, no `*.repo.ts` functions, no Drizzle row
   helpers — and should not use blanket `export *` at all, because that silently
   publishes every internal the module adds later. Importing another module's
   query function *through* its barrel is the same leak as importing the file
   directly: the consumer now depends on that module's tables. If you need
   another module's data, call its service (or a query it deliberately exposes
   via `db/rows.ts`), not its repository. Judge a barrel by its export
   lines, never by its module name. Known deviation — specific statements, not the
   file: in `server/src/modules/repo-intel/index.ts`,
   `export * from './repository.js'` and the blanket `export *` of
   `service.js` — don't copy it; narrow it when touched. Any barrel, including
   a `repo-intel/index.ts` you are looking at, that exports only named types,
   constants or a service is fine and is not this deviation.

10. **Cross-module imports follow the allow-list — and only the allow-list.**
    Which module may import which is a *project decision*, not something to
    judge case by case: an edge that is not listed below is forbidden, even
    when it is a harmless-looking type or constant imported through a clean
    `index.ts`. Every unlisted edge couples release order, test setup and
    ownership between two teams' modules, so adding one is a reviewed change:
    put the new edge in this table (and in `references/layermap.md`) in the same
    PR, with a one-line reason. Current allow-list (`importer → allowed targets`):

    | Module | May import from |
    | --- | --- |
    | `reviews` | `intent` |
    | `intent` | `reviews`, `settings` |
    | `blast` | `reviews`, `repo-intel` |
    | `conventions` | `repo-intel`, `settings` |
    | `history` | `reviews` |
    | `repos` | `repo-intel` |
    | `evals` | `reviews` (`loadDiff` + `PullRow` type for case creation) |
    | `ci` | `repos` (connected-repo check via `RepoRepository`) |
    | any module | `_shared/` |
    | every other pair | — (forbidden) |

    A module not in the left column (including any new module) may import no
    other module until a row is added for it. Shared vocabulary does not need an
    edge: put it in `@devdigest/shared` (types, constants) or `platform/`.
    An unlisted edge is at least **should-fix**; it blocks when it also creates
    a cycle.

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

Must it run later, on a schedule, with retries, or in reaction to another
module's event?
  → a job kind: the producer calls container.jobs.enqueue(...), the owning
    module's service registers the handler. No timers, no cross-module service import.

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
