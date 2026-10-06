# 08 — Intent Layer: derive a PR's intent on a cheap model, show it, and scope the review by it

> Status: **draft** (2026-09-30). Scope: `server/` + `client/` + `reviewer-core/`
> (+ shared contracts in both vendor trees). EARS acceptance criteria in §8.
> README.md:78-84 names this lesson L03 = Intent layer.

## 1. Summary

Before the reviewer agent reads a diff, a **separate, cheap structured-output call**
(OpenRouter, flash-class model, the `review_intent` feature-model slot) reads what the
PR *claims* to do — title, body, linked issues, linked plan/spec docs, and the
**list of changed files with hunk headers only (no diff bodies)** — and returns an
`Intent { summary, in_scope[], out_of_scope[], risk_areas[], missing_context[], confidence }`.
The intent is persisted per PR in the already-existing `pr_intent` table, shown as an
**Intent card on the PR Overview tab**, recomputable with a button, and injected into
every reviewer agent's prompt as an untrusted block with the rule *"don't comment
outside the intent; a serious problem outside scope gets ONE signal finding, not
twenty"* — backed by a deterministic post-filter in `reviewer-core`.

Every classifier call logs its prompt composition (sections + token estimates), model,
sources (kind/ref/status/tokens), and `diff_tokens_saved`; the review run log shows two
distinct LLM calls (intent classifier, then the reviewer). No secrets, body text, doc
contents or diff hunks are logged.

**Out of scope:** Blast Radius card and the rest of `PrBrief`; Jira/Linear/Notion API
integrations (their links are fetched as generic URLs and usually come back
`unresolved`); GitHub GraphQL `closingIssuesReferences` (possible follow-up — it is
empty for non-default-branch PRs anyway); auto-recompute on webhook/poll; the CI
runner (`agent-runner`) consuming intent; a new `FindingKind`; syncing the pre-existing
vendor-tree drift unrelated to the files this spec touches.

## 2. Decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Evolve the existing `Intent` contract (`contracts/brief.ts:8-13`, both trees) to `{summary, in_scope, out_of_scope, risk_areas[{label, kind}], missing_context, confidence}` — field order = generation order, `confidence` **last** (`server/INSIGHTS.md:34`). All fields required, none nullish (strict `json_schema` requires every property). Add `IntentSource`, evolve `PrIntentRecord` (`review-api.ts:60-61`), add `PrIntentResponse {intent: PrIntentRecord \| null, stale: boolean}`. | `intent`→`summary` rename is safe at contract level: only `server/test/contracts.test.ts:70` and the unused `pull.repo.ts:49-67` consume it. |
| D2 | **Keep the DB column `intent`** (Drizzle property `intent`) and map it to contract `summary` in the repo; only **add** columns. *Deviation from the orchestrator's rename*: a drop+add on one table makes `drizzle-kit generate` interactive (`server/INSIGHTS.md:53`). Add-only = one non-interactive generate pass. | Contract `summary` ↔ column `intent` is a deliberate name mismatch; documented in the repo mapper. |
| D3 | Reuse the `review_intent` slot (`platform.ts:52-57`); change default to `openrouter` / `openai/gpt-6-luna` in server registry + client mirror (`client/src/lib/feature-models.ts:20-26`). The Settings picker already lists every live OpenRouter model per feature and saves `{provider:'openrouter'}` (`SettingsModels.tsx:24-40`) — **no picker change needed**; `qwen/qwen3.8-flash`, `google/gemini-3.5-flash-lite`, `deepseek/deepseek-v4.1-flash` are selectable there. | Satisfies "classifier model selectable separately" with zero UI work. |
| D4 | `OpenRouterProvider` already sends `response_format: json_schema, strict: true` (`reviewer-core/src/llm/openrouter.ts:74-77`). Add optional `requireParameters?: boolean` to `StructuredRequest` (both `vendor/shared/adapters.ts`); when set and `id==='openrouter'`, send `provider: { require_parameters: true }`. Only the classifier sets it. | A model/provider without structured outputs fails loudly (→ intent step non-fatal, logged) instead of silently returning prose. |
| D5 | **Classifier algorithm lives in `reviewer-core`** (pure: file-list rendering, message building, injected `LLMProvider`, deterministic confidence adjustment) — `reviewer-core/src/intent/`. Source **collection** (GitHub, URL fetch) is I/O and lives in the server `intent` module via container ports. | Onion rule 5: pure algorithm in the domain; CI runner can reuse it later. Token counting stays server-side (`container.tokenizer`, `container.ts:132-136`) — reviewer-core has no tokenizer. |
| D6 | Sources: (a) `pr_title`, `pr_body`; (b) issues — closing keywords `close/closes/closed/fix/fixes/fixed/resolve/resolves/resolved` + `#N` / `owner/repo#N`, plus explicit `github.com/o/r/issues/N` URLs; **bare `#N` without a closing keyword is NOT a source** (owner decision 2026-09-30); dedup, cap 3; via existing `GitHubClient.getIssue` (`adapters.ts:164`); (c) repo docs — relative `*.md\|*.mdx\|*.txt` paths and same-repo `github.com/<o>/<r>/blob/<ref>/<path>` URLs, cap 3, read **at `pull.headSha`** via a **new** `GitHubClient.getFileContent(repo, path, ref)` (contents API); (d) other `http(s)` URLs, cap 3, via `container.urlFetcher` (SSRF-guarded, size-capped, `safe-fetch.ts:21-60`). Failures → `status:'unresolved'` + `reason`, fed to the classifier as unresolved; binary → `skipped`. `file_list` is always a source. | Contents API chosen over `GitClient.readFile` because that reads the **working tree**, not a ref (`simple-git.ts:129-130`), and PRs may be un-cloned (`diff-loader.ts:19-30` fallback). |
| D7 | Deterministic guards after the model (pure, in reviewer-core): empty/whitespace body → `confidence='low'`; any unresolved source → confidence capped at `medium` and each unresolved ref appended to `missing_context` if the model omitted it. | "Never silently replace an unreachable link by invention" is enforced in code, not only in the prompt. |
| D8 | File list = `path (+adds/-dels)` + each hunk header `@@ -a,b +c,d @@ <section heading>`. Add optional `heading?: string` to `DiffHunk` (both `adapters.ts`) and capture it in `diff-parser.ts:46`. `diff_tokens_saved = tokenizer.count(diff.raw) − tokenizer.count(fileListText)`. | Backward compatible (optional field). |
| D9 | New server module `modules/intent/` (routes → service → repository). `IntentService` reuses `ReviewRepository` (getPull/getRepo/getPrFiles) and `loadDiff` from `reviews/` — precedent: `conventions/service.ts:11` imports `RepoIntelRepository`. The unused intent functions in `reviews/repository/pull.repo.ts:49-67` + `reviews/repository.ts:128-136` **move** to `modules/intent/repository/intent.repo.ts`. | One owner for `pr_intent`. No file-level import cycle (`run-executor → intent/service → reviews/repository, reviews/diff-loader`). |
| D10 | Routes: `GET /pulls/:id/intent` → `PrIntentResponse` (null + `stale:false` when none; `stale = head_sha !== pull.headSha`); `POST /pulls/:id/intent` (no body) → recompute, `rateLimit {max: 5, timeWindow: '1 minute'}`. | Recompute is an explicit mutation, never on mount. |
| D11 | Review run: in `executeRuns` after "Diff ready" (`run-executor.ts:106`), step **"Deriving PR intent"**: use stored intent if present (log `stale` when `head_sha ≠ pull.headSha` — not auto-recomputed), else classify once + persist. Any failure is **non-fatal**: logged, review proceeds without intent. | Two separate LLM calls appear in every run's Live Log / trace (classifier once, shared across agents via the fanned-out `RunLogger`). |
| D12 | Prompt: `ReviewInput.intent?: Intent` → reviewer-core renders `## PR intent (derived — untrusted)` right **before** `## Diff to review`, plus scope rules; new `intent` slot in `PromptAssembly` (`trace.ts:39-52`, both trees). Reconcile `INJECTION_GUARD` (`prompt.ts:16-28`, which already names "derived intent/scope"): intent may *collapse* several out-of-scope defects into one signal finding at the highest severity, but can never produce zero findings for a real defect. | Consistent with the existing guard; an author writing "everything is in scope" cannot descope real defects. |
| D13 | Deterministic cap, reviewer-core: when `input.intent` is present, drop **every** `SUGGESTION`-severity finding whose title starts with `Out of scope:` (owner decision 2026-09-30: the signal is only for serious problems), then keep **at most one** remaining `Out of scope:` finding (case-insensitive) — highest severity (`CRITICAL`>`WARNING`), then highest `confidence`; drop the rest and emit an `info` event with the count. Applied after grounding, before scoring. No new `FindingKind`. | "One signal, not twenty" holds even if the model disobeys. |
| D14 | Observability: `RunLogger` during runs; `req.log` (pino) for the standalone POST, via a tiny `{info, error}` adapter. Logged: model id, per-source `{kind, ref, status, tokens}`, per-section token estimates, total prompt tokens, `diff_tokens`, `file_list_tokens`, `diff_tokens_saved`, real usage + cost. URL refs stored/logged **without query string or fragment**. Never logged: body text, issue/doc contents, hunk bodies, keys. For the reviewer call, log slot token estimates from `outcome.assembly` after it returns. | Directly verifiable by the user's checklist. |
| D15 | UI: `IntentCard` under `OverviewTab/_components/IntentCard/`, rendered **above** the Description. Hooks in NEW `client/src/lib/hooks/intent.ts`. | Seen before the reader opens Findings. |

## 3. What already exists — do not rebuild

| Layer | Already there | File |
|-------|---------------|------|
| DB | `pr_intent` (pr_id PK→pull_requests cascade, `intent` text, `in_scope`/`out_of_scope` jsonb) | `server/src/db/schema/reviews.ts:48-55` |
| Repo | `upsertIntent` / `getIntent` (no callers) | `server/src/modules/reviews/repository/pull.repo.ts:49-67`, `server/src/modules/reviews/repository.ts:128-136` |
| Contract | `Intent`, `PrBrief.intent` | `server/src/vendor/shared/contracts/brief.ts:8-13,118-124` (+ client copy) |
| Contract | `PrIntentRecord` | `server/src/vendor/shared/contracts/review-api.ts:60-61` (+ client copy) |
| Feature model | `review_intent` slot (default `openai/gpt-4.1`) | `server/src/vendor/shared/contracts/platform.ts:52-57`, `client/src/lib/feature-models.ts:20-26` |
| Model resolution | `resolveFeatureModel(container, ws, id)` | `server/src/modules/settings/feature-models.ts:51-57` |
| Settings UI | per-feature OpenRouter model picker | `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:24-40` |
| LLM | strict json_schema + `usage.include` + session id | `reviewer-core/src/llm/openrouter.ts:69-84` |
| Ports | `GitHubClient.getIssue`, `container.urlFetcher`, `container.tokenizer`, `ContainerOverrides.llm/github/urlFetcher/tokenizer` | `server/src/vendor/shared/adapters.ts:164`, `server/src/platform/container.ts:41-57,132-142` |
| Prompt | `wrapUntrusted`, `INJECTION_GUARD` (already mentions "derived intent/scope") | `reviewer-core/src/prompt.ts:16-34` |
| Diff | hunk parsing (drops trailing heading) | `server/src/adapters/git/diff-parser.ts:46-60` |
| Run log | fanned-out `RunLogger`, `step()`; executor comments already promise "diff + intent once" | `server/src/platform/run-logger.ts:36-75`, `server/src/modules/reviews/run-executor.ts:39,52,62-64` |
| Test doubles | `MockLLMProvider` (`structuredBySchema` by `schemaName`, records `calls`), `MockGitHubClient` | `server/src/adapters/mocks.ts:47-110,130` |
| i18n | `brief.block.intent = "Intent"` | `client/messages/en/brief.json:3` |
| Trace UI | `PromptBlock` per assembly slot | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:74-91` |

Verified by: `rg -n "Intent|intent" server/src client/src reviewer-core/src`, `rg -n "upsertIntent|getIntent|PrIntentRecord"`, `rg -n "PrBrief|\bIntent\b" … --glob '!**/vendor/**'`. `server/.dependency-cruiser.cjs` does not exist and `server/package.json` has no `arch:check` — boundaries in this plan are reviewer-enforced.

## 4. Data model

`server/src/db/schema/reviews.ts:48-55` — `prIntent`: keep `prId`, `intent`, `inScope`, `outOfScope` **unchanged**; add (all with defaults or nullable → add-only, single non-interactive generate):

| Property | Column | Type |
|---|---|---|
| `riskAreas` | `risk_areas` | `jsonb.$type<{label:string;kind:string}[]>().notNull().default(sql\`'[]'::jsonb\`)` |
| `missingContext` | `missing_context` | `jsonb.$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)` |
| `confidence` | `confidence` | `text().notNull().default('low')` (Zod enum is the guard, T3) |
| `sources` | `sources` | `jsonb.$type<IntentSourceJson[]>().notNull().default(sql\`'[]'::jsonb\`)` |
| `model` | `model` | `text()` nullable |
| `headSha` | `head_sha` | `text()` nullable |
| `tokensIn` | `tokens_in` | `integer().notNull().default(0)` |
| `tokensOut` | `tokens_out` | `integer().notNull().default(0)` |
| `costUsd` | `cost_usd` | `doublePrecision()` nullable |
| `diffTokensSaved` | `diff_tokens_saved` | `integer().notNull().default(0)` |
| `computedAt` | `computed_at` | `timestamp({withTimezone:true}).notNull().defaultNow()` |

Then `cd server && pnpm db:generate` → `./node_modules/.bin/tsx src/db/migrate.ts`. **Never hand-write the migration.** Expected: one new `0015_*.sql` with only `ALTER TABLE "pr_intent" ADD COLUMN …`. If generate prompts "created or renamed", a column was dropped/renamed by mistake — revert and re-edit (`server/INSIGHTS.md:53`).

## 5. Contracts (`@devdigest/shared`)

Edit **identically** in `server/src/vendor/shared/…` (canonical) and `client/src/vendor/shared/…` (copy).

`contracts/brief.ts` (replace lines 8-13):
```ts
export const IntentRiskKind = z.enum(['auth','dependency','performance','data','security','api','other']); // lowercase
export const IntentRiskArea = z.object({ label: z.string(), kind: IntentRiskKind });
export const IntentConfidence = z.enum(['high','medium','low']);                                          // lowercase
export const Intent = z.object({            // order = generation order; judgement last
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(IntentRiskArea),
  missing_context: z.array(z.string()),
  confidence: IntentConfidence,
});
export const IntentSourceKind = z.enum(['pr_title','pr_body','issue','repo_doc','url','file_list']);
export const IntentSourceStatus = z.enum(['used','unresolved','skipped']);
export const IntentSource = z.object({ kind: IntentSourceKind, ref: z.string(), status: IntentSourceStatus,
  reason: z.string().nullable(), tokens: z.number().int() });
```
(+ `export type` for each.) `PrBrief.intent` keeps pointing at `Intent`.

`contracts/review-api.ts` (replace lines 59-61):
```ts
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(), head_sha: z.string().nullable(), sources: z.array(IntentSource),
  model: z.string().nullable(), tokens_in: z.number().int(), tokens_out: z.number().int(),
  cost_usd: z.number().nullable(), diff_tokens_saved: z.number().int(), computed_at: z.string(),
});
export const PrIntentResponse = z.object({ intent: PrIntentRecord.nullable(), stale: z.boolean() });
```

`contracts/trace.ts` `PromptAssembly` (after `pr_description`, line 50): `intent: z.string().nullish()` with a one-line comment. Both trees (client copy differs only in comments at :44-47 — leave those).

`adapters.ts`: `StructuredRequest.requireParameters?: boolean` (server :55-69; client copy lacks `sessionId` — add only the new field, do not reconcile the old drift); `DiffHunk.heading?: string` (server :190-199 + client); `GitHubClient.getFileContent(repo: RepoRef, path: string, ref: string): Promise<string>` (server :143-167 + client).

`platform.ts` FEATURE_MODELS `review_intent` (server :52-57): `defaultProvider: 'openrouter'`, `defaultModel: 'openai/gpt-6-luna'`, description "Derives a PR's intent and scope on a cheap model before review." — client `platform.ts` copy identically.

## 6. Server

**Presentation** — `server/src/modules/intent/routes.ts` NEW. `withTypeProvider<ZodTypeProvider>()`, `params: IdParams` (`_shared/schemas.js`).
- `GET /pulls/:id/intent` → `service.get(workspaceId, id)`: `Promise<PrIntentResponse>`.
- `POST /pulls/:id/intent` → `service.recompute(workspaceId, id, req.log)`; `config: { rateLimit: { max: 5, timeWindow: '1 minute' } }`.
- Auth: `getContext(container, req)` (`_shared/context.ts:14-23`). Authz: service 404s (`NotFoundError`) when the pull is not in `workspaceId`. Validation: `IdParams`; POST has no body. No Drizzle import.
- Register `intent` in `server/src/modules/index.ts:1-39`.

**Application**
- `server/src/modules/intent/service.ts` NEW — `IntentService(container, reviews = new ReviewRepository(container.db), intents = new IntentRepository(container.db))`:
  - `get(ws, prId)`: `reviews.getPull` (404) → `intents.get(prId)` → `{intent, stale: !!intent && intent.head_sha !== pull.headSha}`.
  - `recompute(ws, prId, logger)`: getPull/getRepo (404) → `loadDiff` (`reviews/diff-loader.ts:12`) → `derive(...)` with a pino adapter `{info:(m,d)=>logger.info(d,m), error:(m,d)=>logger.error(d,m)}` → `{intent, stale:false}`. Errors propagate (route → 5xx/422 via existing handler).
  - `forReview(ws, pull, repo, diff, log)`: stored → log `"Using stored PR intent (derived at <sha7>)"` + `"… stale: PR head moved"` when applicable; else `derive`. Wrapped in try/catch → `log.error("Intent classification failed — reviewing without intent: <message>")`, returns `undefined`.
  - `derive(ws, pull, repo, diff, log)`: `collectIntentSources` → `renderFileList(diff)` → `resolveFeatureModel(container, ws, 'review_intent')` → `container.llm(choice.provider)` → `classifyIntent({llm, model, requireParameters:true, sessionId:\`${owner}/${name}#${n}:intent\`, …})` → token math with `container.tokenizer.count` per section, `diff_tokens_saved` → log composition **before** the call (`"Intent classifier → <provider>/<model>"`, data per D14) and result after (`"Intent derived — confidence=…, in_scope=n, out_of_scope=m, tokens a/b, $c"`) → `intents.upsert(...)` → returns `PrIntentRecord`.
- `server/src/modules/intent/sources.ts` NEW (application ring; I/O only via ports): `collectIntentSources(container, repoRef, pull) → CollectedSource[]` (`{kind, ref, status, reason, text}`); `github = await container.github()` inside try (no token → all issue/doc sources `unresolved: "GitHub not configured"`); `getIssue`, `getFileContent(repoRef, path, pull.headSha)`, `container.urlFetcher.fetch(url)`; UTF-8 decode, NUL byte → `skipped: "binary"`, HTML → `htmlToText`; truncate to `MAX_INTENT_SOURCE_CHARS` (imported from reviewer-core). Runs fetches with `Promise.allSettled`.
- `server/src/modules/intent/helpers.ts` NEW (pure): `extractReferences(body, repoRef) → {issues, docs, urls}` (regexes per D6, dedup, caps 3/3/3; doc paths `path.posix.normalize`, reject absolute / `..`-escaping), `redactUrl(url)` (strip `?query` + `#hash`), `htmlToText(html)`.
- `server/src/modules/reviews/run-executor.ts` — ctor (:44) gains optional `intents = new IntentService(container)`; after :106 `const intent = await runLog.step('Deriving PR intent', () => this.intents.forReview(workspaceId, pull, repo, diff, runLog), {kind:'tool'})`; thread `intent` into `runOneAgent` → `reviewPullRequest({... ...(intent ? { intent } : {}) })` at :198-221; after the call, `runLog.info("Reviewer prompt composition", {model, slots:{system: n, …, intent: n, user: n}})` using `container.tokenizer.count` over non-null `outcome.assembly` slots.

**Data access**
- `server/src/modules/intent/repository/intent.repo.ts` NEW — `upsertIntent(db, prId, record)` / `getIntent(db, prId)`; maps `intent`↔`summary`, `inScope`↔`in_scope`, `riskAreas`↔`risk_areas`, `missingContext`↔`missing_context`, `headSha`↔`head_sha`, `tokensIn`↔`tokens_in`, `tokensOut`↔`tokens_out`, `costUsd`↔`cost_usd`, `diffTokensSaved`↔`diff_tokens_saved`, `computedAt.toISOString()`↔`computed_at`; `confidence` via `IntentConfidence.catch('low')` on read.
- `server/src/modules/intent/repository.ts` NEW — `IntentRepository(db)` facade (`get`, `upsert`).
- `server/src/modules/reviews/repository/pull.repo.ts:4,47-67` and `server/src/modules/reviews/repository.ts:3,128-136` — delete the moved intent code and the `Intent` import.

**Infrastructure**
- `server/src/adapters/git/diff-parser.ts:46-58` — regex `/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/`; set `heading` when `hh[5]?.trim()` is non-empty.
- `server/src/adapters/github/octokit.ts` — `getFileContent` via `octokit.rest.repos.getContent({owner, repo, path, ref, mediaType:{format:'raw'}})` wrapped in `withRetry(withTimeout(…, TIMEOUT))` like `getIssue` (:351-364); non-file → throw.
- `server/src/adapters/mocks.ts:130` — `MockGitHubClient.getFileContent` from an optional `files: Record<string,string>` ctor option; throw `Not Found` otherwise.
- Leave `octokit.ts:126-135` `resolveLinkedIssue` as is (feeds `PrDetail.linked_issue`, not intent).

**reviewer-core (domain)**
- `reviewer-core/src/intent/classify.ts` NEW: `MAX_INTENT_SOURCE_CHARS = 6000`, `MAX_INTENT_BODY_CHARS = 4000`, `INTENT_SYSTEM_PROMPT` (derive scope from stated sources only; one paragraph per non-obvious field; unresolved refs must go to `missing_context`, never be guessed; do not invent), `renderFileList(diff: UnifiedDiff): string` (never emits a line starting with `+`/`-`/space from a hunk body), `buildIntentMessages(input) → {messages, sections:{name,text}[]}` (sections: `system`, `title`, `body`, `issues`, `docs`, `urls`, `unresolved`, `file_list`; every source through `wrapUntrusted`), `adjustIntent(intent, {bodyEmpty, unresolved})` (D7), `classifyIntent(input) → {intent, sections, tokensIn, tokensOut, costUsd, model}` calling `llm.completeStructured({schema: Intent, schemaName:'PrIntent', temperature:0, requireParameters, sessionId})`.
- `reviewer-core/src/llm/openrouter.ts:69-84` — spread `...(this.id === 'openrouter' && req.requireParameters ? { provider: { require_parameters: true } } : {})`.
- `reviewer-core/src/prompt.ts` — `PromptParts.intent?: string`; render `## PR intent (derived — untrusted)\n${wrapUntrusted('pr-intent', …)}\n${INTENT_RULES}` immediately before `## Diff to review`; `assembly.intent`; reword `INJECTION_GUARD` last sentence per D12. Export `renderIntentBlock(intent: Intent): string` (summary, in/out-of-scope bullets, risk areas, missing context, confidence).
- `reviewer-core/src/review/reduce.ts` — `capOutOfScopeFindings(findings) → {kept, dropped}` (D13).
- `reviewer-core/src/review/run.ts:43-104,125-205` — `ReviewInput.intent?: Intent`; `promptParts.intent = input.intent ? renderIntentBlock(input.intent) : undefined`; after grounding apply the cap when `input.intent`, emit `info` event `"Out-of-scope cap: kept 1, dropped N"`; score from the capped set.
- `reviewer-core/src/index.ts` — export `classifyIntent`, `renderFileList`, `buildIntentMessages`, `adjustIntent`, `MAX_INTENT_SOURCE_CHARS`, `capOutOfScopeFindings`.

## 7. Client

- `client/src/lib/hooks/intent.ts` NEW (`"use client"`): `usePrIntent(prId, {pollWhileRunning})` — `queryKey ["pull-intent", prId]`, `api.get<PrIntentResponse>(\`/pulls/${prId}/intent\`)`, `refetchInterval: (q) => pollWhileRunning && !q.state.data?.intent ? 3000 : false`; `useRecomputeIntent(prId)` — mutation `api.post<PrIntentResponse>(…, {})`, `onSuccess` → `setQueryData` + `notify.success`, `onError` → `notify.error` (`client/src/lib/toast.tsx:34-39`). Export from `client/src/lib/hooks/index.ts`.
- `client/src/lib/types.ts:35` — add `Intent, PrIntentRecord, PrIntentResponse, IntentSource` to the type re-exports (types only — runtime values from vendor/shared break the bundle, `client/src/lib/feature-models.ts:3-11`).
- `…/pulls/[number]/_components/OverviewTab/_components/IntentCard/` NEW: `IntentCard.tsx`, `styles.ts`, `index.ts`, `IntentCard.test.tsx`. Props: `{ prId: string; pollWhileRunning: boolean }`. Renders: `SectionLabel` "Intent" + confidence badge (`high|medium|low`) + stale badge ("PR updated since intent was derived") + "Recompute" button (disabled while pending); italic quoted `summary`; two columns "✓ IN SCOPE" / "✕ OUT OF SCOPE" bullet lists; divider; "RISK AREAS" chips (`label`); "Missing context" list when non-empty (warning colour); collapsible "Sources" list — `kind · ref · status`, `unresolved` rows flagged with `reason`; footer `model · tokens · $cost · saved N diff tokens`. Empty: "No intent yet" + "Derive intent" button. Loading and error states.
- `…/OverviewTab/OverviewTab.tsx` — props gain `prId`, `pollWhileRunning`; render `<IntentCard>` first, then Description.
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:140` — `<OverviewTab prId={prId} prBody={pr.body} pollWhileRunning={liveRunIds.length > 0} />`.
- `client/messages/en/brief.json` — add `intent.{inScope, outOfScope, riskAreas, missingContext, sources, confidence.{high,medium,low}, stale, recompute, derive, empty, recomputed, failed, saved, sourceStatus.{used,unresolved,skipped}}`.
- `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:80` — `PromptBlock` for `prompt_assembly.intent` when non-null; `…/RunTraceDrawer/constants.ts:14-22` add `intent` colour; `client/messages/en/runs.json:45-52` add `trace.prompt.intent: "PR intent — derived (dynamic)"`.

## 8. Acceptance criteria (EARS)

- **AC-1** When a user clicks "Derive intent"/"Recompute" on the Overview tab, the system shall call `POST /pulls/:id/intent`, persist the result in `pr_intent`, and render the card with summary, in-scope, out-of-scope and risk-area chips matching the PR's stated goal.
- **AC-2** When the classifier runs, the system shall call the model resolved for the `review_intent` feature (default `openrouter/openai/gpt-6-luna`) via `completeStructured` with `schemaName: 'PrIntent'` and `provider.require_parameters: true`, independent of the reviewer agent's model.
- **AC-3** When the classifier request is built, its messages shall contain file paths, `+adds/-dels` and hunk headers only, and shall contain no diff body line (no line starting with `+`, `-` or a space taken from a hunk).
- **AC-4** Where the PR body references a same-repo plan/spec doc (relative `*.md` path or `github.com/<o>/<r>/blob/…`), the system shall read it at the PR head sha, include it in the classifier prompt as an untrusted source, and record it in `sources` with `kind:'repo_doc'`, `status:'used'`, `tokens > 0`.
- **AC-5** If a referenced issue, doc or URL cannot be read, the system shall record it with `status:'unresolved'` and a `reason`, list it in `missing_context`, and cap `confidence` at `medium`.
- **AC-6** Where the PR body is empty, the system shall classify from title, file names and hunk headers only and set `confidence: 'low'`.
- **AC-7** When the classifier runs, the system shall log model id, per-section token estimates, total prompt tokens, `diff_tokens_saved`, per-source `{kind, ref, status, tokens}` and real usage/cost — and shall not log PR body text, source contents, diff hunks, URL query strings, or API keys.
- **AC-8** When a review run starts, the run's Live Log shall show a "Deriving PR intent" step with the classifier call (or "Using stored PR intent"), followed by the reviewer agent's LLM call with its own model and prompt composition — two distinct LLM calls.
- **AC-9** While an intent exists for the PR, every reviewer agent prompt shall contain a `## PR intent (derived — untrusted)` section before `## Diff to review`, and the run trace's `prompt_assembly.intent` shall be non-null.
- **AC-10** While an intent is injected, the persisted review shall contain at most one finding whose title starts with `Out of scope:`, and that finding shall not be `SUGGESTION` severity.
- **AC-11** If intent classification fails during a review run, the system shall log the error and complete the review without an intent section.
- **AC-12** While the stored intent's `head_sha` differs from the PR's current head, `GET /pulls/:id/intent` shall return `stale: true` and the card shall show the stale indicator.
- **AC-13** When a request targets `/pulls/:id/intent` for a PR outside the caller's workspace, the system shall respond 404.

## 9. Implementation plan

Package managers: `server/`, `client/` = **pnpm** (use direct binaries); `reviewer-core/` = **npm**. Never cross them (T9).

### Phase A — Contracts + ports (both trees) + removal of old intent repo code
| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| A1 | Evolve `Intent`, add `IntentRiskKind/RiskArea/Confidence/SourceKind/SourceStatus/Source` (§5) | `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` | `zod` | AC-1 |
| A2 | Evolve `PrIntentRecord`, add `PrIntentResponse` | `server/src/vendor/shared/contracts/review-api.ts`, `client/src/vendor/shared/contracts/review-api.ts` | `zod` | AC-12 |
| A3 | Add `PromptAssembly.intent` | `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts` | `zod` | AC-9 |
| A4 | `review_intent` default → openrouter / `openai/gpt-6-luna` | `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts`, `client/src/lib/feature-models.ts` | `zod` | AC-2 |
| A5 | `StructuredRequest.requireParameters?`, `DiffHunk.heading?`, `GitHubClient.getFileContent` | `server/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/adapters.ts` | `typescript-expert` | AC-2, AC-3, AC-4 |
| A6 | Implement `getFileContent` in both `GitHubClient` implementers | `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts` | `onion-architecture` | AC-4 |
| A7 | Delete intent functions + `Intent` import (moved in B3) | `server/src/modules/reviews/repository/pull.repo.ts`, `server/src/modules/reviews/repository.ts` | `onion-architecture` | — |
| A8 | Update the `Intent.parse` literal to the new shape; add parse cases for `IntentSource`, `PrIntentResponse` | `server/test/contracts.test.ts:68-72` | `zod` | AC-1 |

Checkpoint: server + client + reviewer-core `tsc` clean.

### Phase B — DB + repository
| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| B1 | Add the §4 columns to `prIntent` (add-only) | `server/src/db/schema/reviews.ts` | `postgresql-table-design`, `drizzle-orm-patterns` | AC-1 |
| B2 | `cd server && pnpm db:generate`; confirm one ADD-only migration; apply with `./node_modules/.bin/tsx src/db/migrate.ts` | `server/src/db/migrations/**` (generated) | `drizzle-orm-patterns` | AC-1 |
| B3 | `intent.repo.ts` with row↔contract mapping (§6), `IntentRepository` facade | `server/src/modules/intent/repository/intent.repo.ts` NEW, `server/src/modules/intent/repository.ts` NEW | `drizzle-orm-patterns`, `onion-architecture` | AC-1, AC-12 |

### Phase C — reviewer-core (npm)
| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| C1 | `requireParameters` → `provider.require_parameters` | `reviewer-core/src/llm/openrouter.ts` | `onion-architecture` | AC-2 |
| C2 | Intent classifier module (§6) | `reviewer-core/src/intent/classify.ts` NEW | `onion-architecture`, `zod` | AC-2..AC-6 |
| C3 | `PromptParts.intent`, `renderIntentBlock`, intent section + rules, `assembly.intent`, reworded `INJECTION_GUARD` | `reviewer-core/src/prompt.ts` | `onion-architecture` | AC-9 |
| C4 | `capOutOfScopeFindings` | `reviewer-core/src/review/reduce.ts` | `typescript-expert` | AC-10 |
| C5 | `ReviewInput.intent`, render + cap wiring | `reviewer-core/src/review/run.ts` | `onion-architecture` | AC-9, AC-10 |
| C6 | Exports | `reviewer-core/src/index.ts` | `typescript-expert` | — |
| C7 | Tests: `renderFileList` emits headers/headings and **no body lines**; `buildIntentMessages` wraps every source untrusted, lists unresolved; `adjustIntent` (empty body → low, unresolved → ≤medium + missing_context appended); `classifyIntent` passes `requireParameters`, `schemaName:'PrIntent'` | `reviewer-core/test/intent.test.ts` NEW | `typescript-expert` | AC-3, AC-5, AC-6 |
| C8 | Tests: intent section present before diff, omitted when absent, `assembly.intent` set, guard wording still forbids zero-finding descoping; cap keeps highest-severity single `Out of scope:` finding | `reviewer-core/test/prompt.test.ts`, `reviewer-core/test/run.test.ts` | `typescript-expert` | AC-9, AC-10 |

### Phase D — Server intent module + review wiring (pnpm)
| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| D1 | Capture hunk heading | `server/src/adapters/git/diff-parser.ts` | `onion-architecture` | AC-3 |
| D2 | Pure reference extraction, URL redaction, html→text | `server/src/modules/intent/helpers.ts` NEW | `typescript-expert` | AC-4, AC-5, AC-7 |
| D3 | Source collector via container ports | `server/src/modules/intent/sources.ts` NEW | `onion-architecture` | AC-4, AC-5 |
| D4 | `IntentService` (`get`, `recompute`, `forReview`, `derive`, logging per D14) | `server/src/modules/intent/service.ts` NEW | `onion-architecture` | AC-1, AC-2, AC-7, AC-11, AC-12 |
| D5 | GET/POST routes with auth, 404 authz, `IdParams`, rate limit | `server/src/modules/intent/routes.ts` NEW | `fastify-best-practices` | AC-1, AC-13 |
| D6 | Register module | `server/src/modules/index.ts` | `fastify-best-practices` | AC-1 |
| D7 | "Deriving PR intent" step, thread `intent`, reviewer prompt-composition log | `server/src/modules/reviews/run-executor.ts` | `onion-architecture` | AC-8, AC-9, AC-11 |
| D8 | Unit: `extractReferences` (all 9 closing keywords, `owner/repo#N`, issue URLs, bare `#N` **ignored**, dedup, caps, `..` path rejected, same-repo blob URL → doc, foreign URL → url), `redactUrl`, heading capture | `server/test/intent-helpers.test.ts` NEW, `server/test/adapters.test.ts` (diff-parser case) | `typescript-expert` | AC-3, AC-4 |
| D9 | Hermetic service test with `MockLLMProvider({structuredBySchema:{PrIntent:…}})`, `MockGitHubClient({files})`, fake `urlFetcher` (one throws), fake tokenizer: classifier messages contain no diff body line; doc text present; unresolved URL in `sources` + `missing_context`; confidence capped; empty body → low; log data contains no body/doc text and no `?query` — repository stubbed via ctor args | `server/test/intent-service.test.ts` NEW | `typescript-expert` | AC-2..AC-7 |
| D10 | DB-backed: GET null → POST → GET record (snake_case fields, `stale:false`); change `pull_requests.head_sha` → `stale:true`; foreign-workspace 404; review run with `MockLLMProvider({structuredBySchema:{PrIntent, Review}})` records **two** `completeStructured` calls (`PrIntent` then `Review`), trace `prompt_assembly.intent` non-null; classifier throwing → run still `done` | `server/test/intent.it.test.ts` NEW | `drizzle-orm-patterns`, `fastify-best-practices` | AC-1, AC-8, AC-11, AC-12, AC-13 |

### Phase E — Client (pnpm)
| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| E1 | Type re-exports | `client/src/lib/types.ts` | `typescript-expert` | — |
| E2 | `usePrIntent`, `useRecomputeIntent`; barrel export | `client/src/lib/hooks/intent.ts` NEW, `client/src/lib/hooks/index.ts` | `react-best-practices` | AC-1, AC-12 |
| E3 | `IntentCard` (+ `styles.ts`, `index.ts`) | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/` NEW | `frontend-ui-architecture`, `react-best-practices` | AC-1, AC-5, AC-6, AC-12 |
| E4 | Mount card in `OverviewTab`; pass props from page | `…/OverviewTab/OverviewTab.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | `frontend-ui-architecture`, `next-best-practices` | AC-1 |
| E5 | i18n keys | `client/messages/en/brief.json`, `client/messages/en/runs.json` | `frontend-ui-architecture` | AC-1 |
| E6 | Trace drawer intent `PromptBlock` + colour | `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `…/RunTraceDrawer/constants.ts` | `react-best-practices` | AC-9 |
| E7 | `IntentCard.test.tsx`: renders summary (italic quote), both lists, chips; unresolved source flagged with reason; low-confidence badge; stale badge; empty state → "Derive intent" click calls POST; Recompute disabled while pending | `…/IntentCard/IntentCard.test.tsx` NEW | `react-testing-library` | AC-1, AC-5, AC-6, AC-12 |

End of task: implementer runs `engineering-insights` (e.g. the contract `summary` ↔ column `intent` mapping, contents-API vs `readFile` choice).

## 10. Risks & gotchas

- **T1 vendor drift** — every contract/port step names both trees (A1-A5). The client `adapters.ts` and `trace.ts` already drift (client lacks `StructuredRequest.sessionId` and `'openrouter'` in `LLMProvider.id`); add only this spec's fields, don't "fix" unrelated drift. `diff -r server/src/vendor/shared client/src/vendor/shared` must show no *new* differences.
- **T2 snake/camel** — contract `summary` ↔ Drizzle `intent`/`intent`; every other field in §6's mapper list. Test D10 asserts the JSON keys.
- **T3 enum casing** — `IntentConfidence`, `IntentRiskKind`, `IntentSourceKind`, `IntentSourceStatus` are all **lowercase**; persisted as `text`/`jsonb`, so Zod is the only guard; repo read uses `.catch('low')` for confidence.
- **T4 migrations** — add-only edit → one generate, no prompt. Do **not** rename `intent`→`summary` in the DB (`server/INSIGHTS.md:53`). Migrations do not run on boot.
- **T5 routes** — both routes: `getContext` auth, workspace-scoped `getPull` → 404, `IdParams`; POST rate-limited 5/min (costs a model call).
- **T6 required fields** — literal sites: `server/test/contracts.test.ts:70` (A8); the old `pull.repo.ts:49-67` mapper (deleted A7); new `MockGitHubClient.getFileContent` (A6). `PrBrief` has no literal builders (`rg -n PrBrief` → only `client/src/lib/types.ts:35`). New `StructuredRequest`/`DiffHunk`/`PromptAssembly` fields are optional/nullish → no fan-out.
- **T8 secrets** — no new secret; GitHub token/OpenRouter key come from existing `secrets` via the container. Logs/`sources.ref` strip URL query strings (tokens in signed URLs).
- **T9 package managers** — see §9 header.
- **Injection** — PR body, issues, docs and URLs are author-controlled: every one is `wrapUntrusted`, char-capped, classifier has no tools; the reviewer's `INJECTION_GUARD` still forbids descoping a real defect to zero findings, and the cap only collapses to one. An author writing "everything is out of scope" can at most collapse findings into one `Out of scope:` signal at the highest severity.
- **SSRF / path traversal** — generic URLs only through `SafeUrlFetcher` (private-address + redirect guards); doc paths normalised, `..`/absolute rejected, read only via contents API at `headSha` of the PR's own repo.
- **require_parameters** — some OpenRouter models/providers reject it (HTTP 404 "no endpoints"); the review path treats that as non-fatal (AC-11); the POST surfaces the error toast. The user picks another model in Settings.
- **Cost** — one classifier call per first review/recompute; ≤ ~9 sources × 6000 chars cap bounds input; stored intent is reused across agents and later runs.
- **Stale intent** — not auto-recomputed; stale flag in API + card; review log says it used a stale intent.
- **Concurrent POST + review derive** — upsert is last-writer-wins on `pr_id`; acceptable.
- **Strict json_schema** — all `Intent` properties required, no `.optional()` (strict mode rejects optional properties).
- **Card empty during first run** — `pollWhileRunning` refetches every 3 s until an intent exists.

## 11. Verification

| # | Command | Expected |
|---|---------|----------|
| V1 | `cd reviewer-core && npm run typecheck && npm test` | clean; `intent.test.ts`, `prompt.test.ts`, `run.test.ts` pass |
| V2 | `cd server && ./node_modules/.bin/tsc --noEmit` | clean |
| V3 | `cd server && ./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'` | pass incl. `intent-helpers`, `intent-service`, `contracts` |
| V4 | `cd server && pnpm db:generate` then `ls src/db/migrations/*.sql \| tail -1` | one new ADD-only `0015_*.sql`; no interactive prompt |
| V5 | `cd server && TEST_DATABASE_URL=… ./node_modules/.bin/vitest run .it.test --no-file-parallelism` | pass incl. `intent.it.test.ts` |
| V6 | `cd client && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run` | clean; `IntentCard.test.tsx` passes |
| V7 | `diff -r server/src/vendor/shared client/src/vendor/shared` | no differences beyond the pre-existing ones listed in §10 T1 |
| V8 (manual, AC-1/4) | Open a PR whose body links a repo spec (`specs/…md`) and an issue → Overview → "Derive intent" | card summary matches the PR goal; Sources list shows `repo_doc … used` with tokens |
| V9 (manual, AC-5/6) | PR with empty body; PR linking an unreachable URL | `low` badge; unresolved source with reason + "Missing context" row, confidence ≤ medium |
| V10 (manual, AC-2/3/7) | Server stdout after POST | one pino line with model `openai/gpt-6-luna` (or Settings choice), sections + token estimates, `diff_tokens_saved`, sources; no body/doc text, no `+`/`-` hunk lines, no keys; OpenRouter dashboard session `<o>/<r>#N:intent` |
| V11 (manual, AC-8/9/10) | Run a review → Live Log / trace drawer | "Deriving PR intent" (or "Using stored PR intent") then the reviewer call with its own model + "Reviewer prompt composition"; trace shows the Intent prompt block; ≤1 `Out of scope:` finding |
| V12 (e2e) | `cd e2e && npm run e2e:hermetic` (needs Docker) | existing flows still green (Overview tab changed) |

## 12. Resolved questions (owner, 2026-09-30)

- **Existing `review_intent` overrides** — left untouched; the new flash default applies only where no choice was saved.
- **Bare `#N` mentions** — not a source; only closing-keyword references (and explicit issue URLs) count.
- **Out-of-scope `SUGGESTION` findings** — dropped entirely; the single signal is CRITICAL/WARNING only.
- **OpenRouter model ids / `require_parameters`** — from the 2026-09-30 live catalog; re-verified live by the orchestrator before release.

## 13. Changes made during verification (2026-09-30)

Found by the live run, `architecture-reviewer` and `plan-verifier`; all covered by tests.

| # | Change | Why |
|---|--------|-----|
| P1 | With `requireParameters`, the OpenRouter adapter sends `temperature` only when the caller set it; the classifier sets none. | `openai/gpt-6-luna` does not accept `temperature` → `require_parameters` found no provider ("404 No endpoints found"). |
| P2 | Classifier sends `max_tokens = MAX_INTENT_OUTPUT_TOKENS` (4000). | Without it OpenRouter reserves the model's full output window against credits → 402. |
| P3 | Caps raised: body 4000 → 12000 chars, per source 6000 → 16000; every cut carries a `[truncated by DevDigest: …]` note (`truncateForIntent`). | An unmarked cut read to the model as an unfinished document and polluted `missing_context`. |
| P4 | "Generated with Claude Code" attribution links are not sources. | They were always `unresolved` and capped confidence on every PR. |
| P5 | Issues from another repository are recorded `unresolved` ("issue in another repository — not fetched"). | AR-3: confused deputy — the workspace token must not read a private foreign issue named by a PR author. |
| P6 | `isPrivateAddress` decodes hex IPv4-mapped/compatible IPv6 (`::ffff:7f00:1`). | AR-1: WHATWG URL serialises `[::ffff:127.0.0.1]` to hex, bypassing the SSRF guard on author-supplied URLs. |
| P7 | Malformed `%` escapes in blob URLs no longer throw. | AR-2: `collectIntentSources` must never throw. |
| P8 | The out-of-scope cap *collapses*: the kept signal finding lists the other CRITICAL/WARNING out-of-scope defects (title + `file:line`); the log reports the real kept count and dropped locations. | AR-4 / PV-2. |
| P9 | Prompt composition (per-section tokens, diff tokens saved, source statuses) is in the log **message text**, not only `data`. | PV-1: the Live Log and persisted trace render `msg` only. |
| P10 | IntentCard: bullets, wrapping risk chips, `minmax(0,1fr)` columns; classifier asked for ≤6-word risk labels. | Long labels overflowed and scrolled the page. |
