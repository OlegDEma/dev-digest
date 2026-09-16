# 01 — Run Cost Badge

> Status: **spec + plan** (pre-implementation). Cross-module: `server` + `client`
> (`reviewer-core` already computes cost — see §2). EARS acceptance criteria in §6.

## 1. Summary

Surface the **USD cost** of agent review runs in three places in the studio UI:

1. **PR list** — a `COST` column, one value per PR (the latest review's cost).
2. **PR detail → Agent runs timeline** — per-run cost next to the run's time
   and token count (e.g. `9,119 tok · $0.0013`).
3. **Run trace sidebar → Stats** — a `Cost` tile alongside Duration, Tokens,
   Findings (e.g. `$0.06`).

The number already exists end-to-end in the engine; it is dropped before it
reaches the database and the UI. This feature **reconnects** it — no new model
calls, no new cost math.

### Out of scope (confirmed with product)

- **Verdict banner line** on PR detail (`$0.014 · 8.2K→1.3K`). The design board
  shows it, but scope is the three screens above only. `VerdictBanner.tsx` is
  untouched. (Easy follow-up: same `formatCostUsd` + one row.)
- **Per-severity FINDINGS column** on the PR list. The design mockup shows it,
  but the starter list intentionally omits it (`pulls/routes.ts:114-117`); it is
  a separate feature and not part of this one.
- Multi-Agent Review and Agent Performance screens — they **already** render
  cost via existing contracts (`AgentColumn.cost_usd`, `AgentStats.*cost_usd`).

## 2. Background — current state (why this is a reconnect)

The cost pipeline is fully built up to the server boundary and then severed:

| Layer | State today | Evidence |
|-------|-------------|----------|
| OpenRouter provider | Requests `usage: {include:true}`, reads real `usage.cost`; falls back to an injected `estimateCost` | `reviewer-core/src/llm/openrouter.ts:83,97-107` |
| Pricing table / live prices | `PriceBook` (live OpenRouter prices) + static `estimateCost` fallback, injected into every provider | `server/src/platform/price-book.ts`, `server/src/platform/container.ts:186-187`, `server/src/adapters/llm/{openai,anthropic}.ts` |
| Engine result | `ReviewOutcome.costUsd: number \| null`, with **null-propagation** (any chunk with unknown cost ⇒ whole-run null) | `reviewer-core/src/review/run.ts:110,159,184,216` |
| **Server executor** | **Drops `costUsd`** — destructures only `{ tokensIn, tokensOut, grounding }` | `server/src/modules/reviews/run-executor.ts:213` |
| **DB** | `agent_runs` has `tokens_in/out` but **no `cost_usd`** column (ref build's migration `0010` is absent on `main`) | `server/src/db/schema/runs.ts:8-31` |
| **Contracts** | `RunStats` / `RunSummary` / `PrMeta` carry tokens & score but **no cost** | `contracts/trace.ts:61-113`, `contracts/platform.ts:157-173` |
| **Client** | Renders cost **nowhere**; no `formatCostUsd` | grep: 0 hits in `client/src/**/*.tsx` |

So the work is: **add one nullable column, thread the value the engine already
returns through persistence + three contracts, and render it in three
components.** No change to `reviewer-core`.

### Cost semantics (product decision)

- **PR-list `COST`** = the PR's **current review cost** = the **sum over agents**
  of each agent's most-recent run cost. Cost is additive: a multi-agent review's
  price is *all* its agents (e.g. Security + Performance + General), not just the
  one that persisted last. This differs from `SCORE`, which shows a single latest
  review — because a score is not summable but a cost is. Implemented by summing
  the latest run per `(pr, agent)` (`pulls/routes.ts`). Null (→ `—`) when the PR
  has no priced run; unpriced runs (null cost) are skipped from the sum.
  - **History:** first shipped as "latest single run cost" and corrected to the
    per-agent sum on 2026-09-15 — the single-run number under-reported multi-agent
    reviews (showed one agent's cost, e.g. $0.000337, instead of the $0.000783 total).
- **Timeline / Stats `COST`** = that individual run's `cost_usd`.

### The "no fake price" rule is free

A `null` cost renders as `—`, never `$0.00`. This falls out naturally:
- Failed / cancelled / still-running runs persist `cost_usd = null` (see §5).
- The engine already returns `null` when any chunk's price is unknown.
- A genuine `0` (a free model reporting `usage.cost = 0`) is real data and
  renders as `$0.00` — truthful, and distinct from `—`.

## 3. Data model

Add one nullable column to `agent_runs`, reusing the house pattern already used
for cost on other tables (`ci.ts:23`, `eval.ts:34`):

```ts
// server/src/db/schema/runs.ts  (agentRuns)
costUsd: doublePrecision('cost_usd'),   // nullable; import doublePrecision from drizzle-orm/pg-core
```

Migration is **generated, never hand-written** (server CLAUDE.md):
`cd server && pnpm db:generate` → produces `0010_*.sql`
(`ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;`), then
`pnpm db:migrate` (migrations do **not** run on boot).

## 4. Contracts (`@devdigest/shared`)

> ⚠️ **Drift gotcha (root INSIGHTS):** `client/src/vendor/shared/` is a hand-copy
> of `server/src/vendor/shared/` with **no sync script**. Every contract edit
> below must be applied **identically in both trees**, or the client desyncs.

| Contract | Change | File(s) |
|----------|--------|---------|
| `RunStats` | add `cost_usd: z.number().nullable()` | `contracts/trace.ts` (server + client) |
| `RunSummary` | add `cost_usd: z.number().nullable()` | `contracts/trace.ts` (server + client) |
| `PrMeta` | add `cost_usd: z.number().nullish()` (list-only, parallel to `score`) | `contracts/platform.ts` (server + client) |

`RunStats.cost_usd` is **required-nullable** on purpose: it forces every trace
builder to set it (and `buildRunTrace` `.parse`-validates the trace at write
time). Making it optional would let a builder silently omit it.

## 5. Cost formatting (client)

One shared helper (new `client/src/lib/format.ts`, or colocate; reused by all
three screens):

```ts
/** USD cost for the UI. null/undefined → em dash; never "$0.00" for a real cost. */
export function formatCostUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0.00";              // real free-model zero, truthful
  return `$${Number(n.toPrecision(3))}`;    // 3 significant figures, trailing zeros trimmed
}
```

`toPrecision(3)` → `Number` reproduces every design example without special
cases: `0.012→$0.012`, `0.0013→$0.0013`, `0.014→$0.014`, `0.06→$0.06`,
`0.003→$0.003`, `1.23→$1.23`. It never collapses a sub-cent cost to `$0.01`.

Timeline token+cost line: `${(tokens_in + tokens_out).toLocaleString()} tok · ${formatCostUsd(cost_usd)}`.

## 6. Acceptance criteria (EARS)

**Persistence**
- **AC-1** — When an agent run completes successfully, the system shall persist
  the engine's `ReviewOutcome.costUsd` into `agent_runs.cost_usd`.
- **AC-2** — When a run fails, is cancelled, or is still running, the system
  shall leave `agent_runs.cost_usd` null (no fabricated cost).
- **AC-3** — While assembling a run trace, the system shall include
  `stats.cost_usd` equal to the run's persisted cost (or null).

**PR list (screen 1)**
- **AC-4** — When the PR list is served, each PR shall carry `cost_usd` = the
  **sum over agents** of each agent's most-recent run cost (the whole latest
  review, not one agent), or null if the PR has no priced run.
- **AC-5** — When a PR row renders and `cost_usd` is non-null, the `COST` column
  shall show it via `formatCostUsd`; when null, it shall show `—`.

**Timeline (screen 2)**
- **AC-6** — When a settled run renders in the Agent-runs timeline, its row shall
  show the run's total tokens and cost near its timestamp
  (e.g. `9,119 tok · $0.0013`); a run with null cost shows `—` in place of the price.

**Trace sidebar (screen 3)**
- **AC-7** — When the trace Stats block renders, it shall show a `Cost` tile
  (Duration · Tokens · **Cost** · Findings) using `formatCostUsd(stats.cost_usd)`.

**Format & integrity (design verification tasks)**
- **AC-8** (*звірка цифр*) — The displayed cost shall equal the run log's cost and
  the OpenRouter dashboard cost for the same run (reconciled on one real run).
- **AC-9** (*формат читабельний*) — Cost shall render with ≥3 significant digits
  (`$0.012`, not `$0.01`).
- **AC-10** (*stale/незавершений*) — An incomplete/failed run shall never show a
  fabricated price; it shows `—`.
- **AC-11** (*нуль зайвих викликів*) — The feature shall add **zero** additional
  model calls; cost comes only from the `usage` already returned per run.

## 7. Implementation plan (phased, file-by-file)

### Phase A — DB + contracts (foundation)
1. `server/src/db/schema/runs.ts` — add `costUsd: doublePrecision('cost_usd')`
   (import `doublePrecision`).
2. `cd server && pnpm db:generate && pnpm db:migrate` → `0010_*.sql`.
3. `contracts/trace.ts` (**server + client**) — add `cost_usd` to `RunStats` and
   `RunSummary`.
4. `contracts/platform.ts` (**server + client**) — add `cost_usd` to `PrMeta`.

### Phase B — server persistence + reads
5. `repository/run.repo.ts`
   - `completeAgentRun`: add `costUsd?: number \| null` to the values type; add
     `costUsd: values.costUsd ?? null` to `.set({...})`.
   - `listRunsForPull`: add `cost_usd: run.costUsd` to the mapped `RunSummary`.
6. `repository.ts` (barrel) — mirror the `costUsd?: number \| null` field in the
   restated `completeAgentRun` values type (lines 153-166); body already passes
   `values` through.
7. `run-executor.ts`
   - `:213` destructure `costUsd`: `const { tokensIn, tokensOut, costUsd, grounding } = outcome;`
   - success `completeAgentRun` (`:243`) — add `costUsd`.
   - success trace `stats` (`:265`) — add `cost_usd: costUsd`.
   - `failAll` `completeAgentRun` (`:78`) — add `costUsd: null`.
   - failure `completeAgentRun` (`:298`) — add `costUsd: null`.
   - `traceFromBuffer` stats (`:424`) — add `cost_usd: null`.
8. `modules/pulls/routes.ts` (list handler) — one `IN`-query over the PR's done
   `agent_runs`, newest-first; keep the latest run per `(pr, agent)` and sum their
   `cost_usd`, then set `cost_usd` on each returned PR:

   ```ts
   const costByPr = new Map<string, number>();
   const runRows = await container.db
     .select({ prId: t.agentRuns.prId, agentId: t.agentRuns.agentId, costUsd: t.agentRuns.costUsd })
     .from(t.agentRuns)
     .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
     .orderBy(desc(t.agentRuns.ranAt));
   const countedAgents = new Map<string, Set<string>>();
   for (const r of runRows) {                       // newest-first
     if (!r.prId) continue;
     const agentKey = r.agentId ?? '∅';
     const counted = countedAgents.get(r.prId) ?? new Set<string>();
     if (counted.has(agentKey)) continue;           // older run for this agent → skip
     counted.add(agentKey); countedAgents.set(r.prId, counted);
     if (r.costUsd != null) costByPr.set(r.prId, (costByPr.get(r.prId) ?? 0) + r.costUsd);
   }
   // in the row map:
   cost_usd: costByPr.get(r.id) ?? null,
   ```

### Phase C — client rendering
9. `client/src/lib/format.ts` — add `formatCostUsd` (§5).
10. `pulls/constants.ts` — add `"cost"` to `COLUMNS` (before `"updated"`); add a
    column to the `GRID` template (fixed width, like `score`/`status`).
11. `pulls/styles.ts` — add `costCell` if a dedicated style is wanted (right-aligned, muted).
12. `pulls/_components/PRRow/PRRow.tsx` — add the cost cell:
    `pr.cost_usd != null ? formatCostUsd(pr.cost_usd) : "—"` (parallels the
    existing `pr.score != null ? … : —` at `:49-55`).
13. `pulls/[number]/_components/RunHistory/RunHistory.tsx` — in the right meta
    column (`:198-200`), for settled runs render
    `{(tokens_in+tokens_out).toLocaleString()} tok · {formatCostUsd(cost_usd)}`
    under the timestamp.
14. `RunTraceDrawer/_components/TraceBody/TraceBody.tsx` — add a 4th `<Stat>`
    (`:63-67`) between Tokens and Findings:
    `<Stat label={t("trace.stat.cost")} val={formatCostUsd(stats.cost_usd)} />`.
15. i18n (`en` only): `messages/en/prReview.json` → `list.columns.cost = "Cost"`;
    `messages/en/runs.json` → `trace.stat.cost = "Cost"`.

### Phase D — tests + seed
16. Fixtures made to typecheck against the new required field:
    - `RunTraceDrawer/RunTraceDrawer.test.tsx:10` — add `cost_usd` to `stats`.
    - `RunHistory/RunHistory.test.tsx:25` — add `cost_usd` to the run fixture.
17. New tests:
    - `format.test.ts` — `formatCostUsd`: null→`—`, `0`→`$0.00`, `0.0013`→`$0.0013`,
      `0.012`→`$0.012`, `0.06`→`$0.06`.
    - `PRRow` — renders cost / `—`.
    - `RunHistory` — settled run shows `tok · $…`; failed run shows `—`, no price.
    - `TraceBody` — Cost tile present with formatted value.
    - Server `run.repo.it.test.ts` (DB-backed) — `completeAgentRun` persists
      `cost_usd`; `listRunsForPull` returns it; failure path stays null.
    - Server pulls list it-test — PR `cost_usd` = latest review's run cost.
18. **Seed (optional):** `seed.ts` inserts `reviews` but not `agent_runs`, so the
    timeline/sidebar are empty until a review runs. In dev the mock LLM returns
    `costUsd 0.001`, so cost appears on the first run. Only backfill seeded
    `agent_runs` (with `cost_usd`) if you want the three screens populated
    out-of-the-box — not required for any AC.

## 8. Risks & gotchas

- **Vendored-shared drift** (§4) — the #1 way to break this: edit only the server
  copy and the client silently keeps the old shape. Apply all contract edits to
  both trees.
- **Required-field fan-out** — making `RunStats.cost_usd` required breaks every
  `stats:{…}` literal at compile time. That is intended; the only sites are the
  two in `run-executor.ts` plus two test fixtures (§7 covers all four).
- **Migration not on boot** — after `db:generate` you must `db:migrate`, or reads
  hit `column "cost_usd" does not exist`.
- **`reviews.run_id` may be null** on older rows → list cost falls back to `—`. Fine.
- **Don't touch** `reviewer-core` (already correct) or `server/clones/**`.

## 9. Estimate

Small. ~1 column, 3 contract fields (×2 trees), ~6 server edits, ~6 client
edits, i18n, tests. No new dependencies, no engine change, no new endpoints.
