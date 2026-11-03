# Layer map — the onion on our real files

This is the reference for **where a ring physically lives** in devDigest and what
it is allowed to touch. Read it when you're unsure which file a piece of code
belongs in, or whether an import crosses a boundary the wrong way.

## Top-level shape (`server/src/`)

```
server/src/
  modules/<name>/     ← presentation + application + data-access, one feature per folder
  platform/           ← infrastructure: DI container, config, errors, SSE bus, jobs, price-book
  adapters/           ← port implementations (llm, github, git, codeindex, embedder, depgraph,
                        tokenizer, secrets, auth) + mocks.ts
  db/                 ← Drizzle schema (schema/*.ts), client, migrations, seed, rows.ts
  vendor/shared/      ← @devdigest/shared — the Zod contracts (vendored, treat as read-only)
  app.ts              ← composition root: builds Fastify, wires zod type-provider, registers modules
reviewer-core/        ← the DOMAIN core (separate package, consumed as TS source)
```

`app.ts` + `modules/index.ts` are the **composition root**: the only place that
knows the whole graph and wires it together. Everything else stays ignorant of
the whole.

## Ring by ring

### Domain (center) — `reviewer-core/`, domain types in `@devdigest/shared`

The purest ring. `reviewer-core` describes itself as a *pure engine*: "No
DB/GitHub/FS; the only side effect is an injected `LLMProvider`." The review
algorithm (prompt assembly → LLM call → grounding → reduce to findings) lives
here, and it is consumed by the server as TypeScript source through a tsconfig
path alias — it never emits JS and it **never imports from `server/`**.

- **May import:** other domain code, port *interfaces* from `@devdigest/shared`.
- **Must not import:** `drizzle-orm`, `fastify`, `server/src/**`, any adapter.
- **Litmus test:** you can unit-test it with a fake `LLMProvider` and nothing else.

Domain *types* (the `Finding`, `Review`, `RunTrace`, `Provider`, `UnifiedDiff`
shapes) live in `@devdigest/shared/contracts/*`. They are shared inward-safe
vocabulary — every ring may name them.

### Application — `modules/<name>/service.ts`, `run-executor.ts`

Orchestration. A service resolves tenancy, creates run rows, kicks off
background execution, and coordinates ports + repository for **one use case**. It
owns I/O sequencing and persistence + observability — but not the algorithm
(that's domain) and not HTTP shaping (that's presentation).

- Construct from the container: `new ReviewService(container)`; the service then
  builds its repository (`new ReviewRepository(container.db)`) and reaches ports
  via `container.llm(...)`, `container.github()`, `container.repoIntel`.
- `reviews/run-executor.ts` is the pattern for heavy background work extracted
  out of the service: "The service owns only I/O … and persistence + observability."
  It calls `reviewPullRequest(...)` from `@devdigest/reviewer-core` — application
  invoking domain, arrow pointing inward. ✅
- **May import:** domain (`reviewer-core`, shared types), port interfaces, its own
  repository, `platform/` errors.
- **Must not import:** `fastify` request/reply types, concrete adapter classes,
  SDK clients (`@anthropic-ai/sdk`, `openai`, `octokit`, `simple-git`).

### Data access — `modules/<name>/repository.ts` + `repository/*.repo.ts`

The **only** ring that speaks Drizzle. `reviews/repository.ts` says it plainly:
"The ONLY layer touching the DB for the review domain." The facade class keeps a
flat public API and delegates to per-aggregate query modules
(`repository/{review,run,pull}.repo.ts`), which import `drizzle-orm`
(`and, desc, eq, inArray`) and `db/schema`.

- **May import:** `drizzle-orm`, `db/schema`, `db/rows.ts`, domain types.
- **Must not import:** `fastify`, its own service, another module's repository.
- Cross-module row types are centralized in `db/rows.ts` (via `$inferSelect`) so a
  consumer never reaches into another module's data layer.

### Infrastructure (rim) — `platform/`, `adapters/`, `db/`

The outermost ring. It *implements* the port interfaces declared inward and wires
everything in the container. This ring is allowed to depend on anything inward —
that's its job.

- **Ports:** the interfaces (`GitHubClient`, `GitClient`, `LLMProvider`,
  `Embedder`, `CodeIndex`, `AuthProvider`, `SecretsProvider`) are declared in
  `@devdigest/shared` and consumed by `platform/container.ts`.
- **Adapters:** `adapters/<capability>/<impl>.ts` implement those interfaces
  (`OctokitGitHubClient`, `SimpleGitClient`, `OpenAIProvider`, `AnthropicProvider`,
  `OpenAIEmbedder`, `RipgrepCodeIndex`, `DepCruiseGraph`, `TiktokenTokenizer`).
  `adapters/mocks.ts` provides the test doubles.
- **Container:** `platform/container.ts` builds adapters lazily from secrets and
  swaps them for mocks via `ContainerOverrides`. This is the inversion seam.

### Presentation (rim) — `modules/<name>/routes.ts`

A Fastify plugin. HTTP + SSE surface only: declare Zod schemas, call the service,
translate the result and errors into a response. Registered statically in
`modules/index.ts` (one import + one `app.register`).

- **May import:** its service, Zod contracts from `@devdigest/shared`,
  `platform/errors`, `_shared/context` + `_shared/schemas`.
- **Must not import:** `drizzle-orm` / `db/schema` directly — that's rule 2.

## Module tiers (not every feature needs every ring)

Modules scale their file split to complexity. All three tiers are legitimate —
what matters is that a module never *leaks* across a boundary, not that it fills
every ring.

- **Full split** — `reviews/`: `routes` + `service` + `run-executor` +
  `repository` + `repository/*.repo.ts` + `helpers` + `findings` + `diff-loader`
  + `constants`. The reference for anything with orchestration + persistence.
- **Facade** — `repo-intel/`: `routes` + `service` (facade over a hidden
  `pipeline/`) + `repository` + `types.ts` (the `RepoIntel` interface every
  feature codes against). Use when internals are complex enough to hide.
- **Mid-tier** — `repos/`, `agents/`: `routes` + `service` + `repository` +
  `helpers` + `constants`.
- **Thin** — `pulls/` (`routes` + `status`), `polling/`, `workspace/`,
  `settings/`: routes only (± helpers). Legitimate *only* as pure read/proxy;
  see deviations below.

## Known deviations (paying-down list)

The layering is a convention the codebase *mostly* follows. These are the current
exceptions — the skill's job is to stop new ones and, when touched, migrate them:

- **`pulls/routes.ts` — Drizzle in the route.** Imports `drizzle-orm` + `db/schema`
  and calls `container.db.select/insert/update/delete` directly inside handlers,
  with real orchestration (GitHub sync, backfill, score/cost aggregation). This is
  a rule-2 leak and the primary migration target — see the recipe in
  [`enforcement.md`](enforcement.md) and the before/after in [`examples.md`](examples.md).
- **`polling/`, `workspace/`** — routes-only. Fine while they stay pure proxies;
  re-evaluate the moment they persist or orchestrate.
- **`settings/`** — routes + helpers, no repository. Acceptable today; if settings
  gain their own persistence, add a repository rather than querying inline.

`server/docs/` and `server/specs/` are currently stubs, so the documented sources
of truth are the `AGENTS.md` files, `README.md` (the request/DI-flow diagram),
and `INSIGHTS.md`. This skill is the architectural layer of that record.
