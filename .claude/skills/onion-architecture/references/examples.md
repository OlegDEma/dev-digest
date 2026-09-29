# Examples — the onion on our own code

Concrete good/bad, all drawn from this repo so the pattern is recognizable rather
than abstract. `✅` follows the rings; `❌` leaks across them.

## ✅ Reference: `reviews/` — the full onion

The flow for triggering a review touches every ring in the right direction:

```
routes.ts            (presentation) — declares Zod schema, calls the service
   └─ service.ts     (application)   — resolves tenancy, creates the run row,
        │                              fires background execution
        ├─ run-executor.ts           — sequences I/O + persistence + observability
        │     └─ reviewPullRequest() ← DOMAIN (@devdigest/reviewer-core): the pure
        │                              prompt→LLM→grounding→reduce algorithm
        ├─ repository/*.repo.ts      (data access) — the ONLY Drizzle here
        └─ container.llm(), .github() (ports) — external I/O via interfaces
```

Why it's correct:

- The **algorithm** lives in `reviewer-core` and receives its one side effect (the
  `LLMProvider`) by injection — the center stays pure.
- The **service** owns orchestration only; `run-executor.ts` states it: "the
  service owns only I/O … and persistence + observability."
- **Drizzle** appears solely in `repository/{review,run,pull}.repo.ts`;
  `repository.ts` is the flat facade over them ("The ONLY layer touching the DB").
- **External systems** are reached through `container.llm(id)` / `container.github()`
  — interfaces from `@devdigest/shared`, implemented in `adapters/`, so tests
  inject mocks via `ContainerOverrides`.

## ✅ Ports over concretions (`platform/container.ts`)

```ts
// The service asks the container for a capability by its interface…
const gh = await container.github();          // Promise<GitHubClient>  (port)
const llm = await container.llm('anthropic');  // Promise<LLMProvider>   (port)

// …and the container is the ONE place that knows the concrete adapter:
this._github = new OctokitGitHubClient(token);        // adapters/github/octokit.ts
return new AnthropicProvider(key);                    // adapters/llm/anthropic.ts
```

The interfaces (`GitHubClient`, `LLMProvider`) live in `@devdigest/shared`; the
classes live in `adapters/`. That split is rule 3 — and it's exactly what lets a
test pass `{ github: fakeGitHub }` through `ContainerOverrides` without a network.

## ❌ Anti-pattern: `pulls/routes.ts` — Drizzle in the route

The live rule-2 leak. The route imports persistence directly and runs DB work in
the handler:

```ts
// pulls/routes.ts (current)
import { and, desc, eq, inArray } from 'drizzle-orm';   // ❌ Drizzle in presentation
import * as t from '../../db/schema.js';                // ❌ schema in presentation

app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const [repo] = await container.db.select().from(t.repos).where(/* … */);   // ❌
  // …GitHub sync loop with container.db.insert().onConflictDoUpdate()…      // ❌
  // …diff-stat backfill with container.db.update()…                        // ❌
  // …score + cost aggregation across reviews/agentRuns…                    // ❌ logic in route
});
```

Three boundaries crossed at once: DB access in presentation (rule 2), orchestration
in a route (rule 5), and aggregation logic that can't be unit-tested without HTTP.

**After migration** (see the recipe in [`enforcement.md`](enforcement.md)):

```ts
// pulls/routes.ts — thin: HTTP in, DTO out
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PullsService(app.container);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForRepo(workspaceId, req.params.id);   // ✅ one call
  });
}

// pulls/service.ts — orchestration (GitHub sync, backfill, aggregation)
// pulls/repository.ts — the only Drizzle: listByRepo, upsertFromGitHub, latestReviewScores…
// pulls/helpers.ts — pure row→PrMeta and cost/score reductions (DB-free, unit-tested)
```

No behavior changes — the offline-first sync, the backfill cap, the additive cost
rule all survive. They just move to the ring that owns them.

## ❌ Anti-pattern: a service constructing an SDK client

```ts
// modules/reviews/service.ts
import Anthropic from '@anthropic-ai/sdk';               // ❌ concretion in application
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });  // ❌
```

Breaks rule 3 (and secrets policy — keys come from `SecretsProvider`, not
`process.env`). It couples the application ring to a vendor SDK and makes the
service impossible to test without a real key.

```ts
// ✅ instead
const llm = await container.llm('anthropic');   // port; key resolved via SecretsProvider; mockable
```

## ❌ Anti-pattern: the domain reaching outward

```ts
// reviewer-core/src/review.ts
import { db } from '../../server/src/db/client.js';      // ❌ center importing the rim
import type { FastifyRequest } from 'fastify';           // ❌ HTTP in the domain
```

This inverts the arrow — the whole point of the onion is that the center knows
nothing about persistence or transport. If the algorithm needs data, it receives
it as a parameter or through an injected port interface, never by importing an
outer ring.

```ts
// ✅ instead — data and side effects arrive as arguments
export async function reviewPullRequest(input: ReviewInput, llm: LLMProvider): Promise<Review> { … }
```

## Reading a violation

When `pnpm arch:check` fails it names the rule from [`enforcement.md`](enforcement.md).
Translate it back to the ring it protects:

- `no-drizzle-outside-repository` → move the query into a repository (rule 2).
- `no-sdk-in-application` / `no-adapter-import-from-inner-rings` → go through a
  container port (rule 3).
- `no-fastify-in-application-or-data` → the HTTP concern belongs in the route (rule 5).
- `domain-stays-pure` → the domain must receive it, not import it (rule 1).
