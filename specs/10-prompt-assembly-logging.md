# 10 — Safe structured logging of prompt assembly

> Status: **revised — awaiting final owner approval** (2026-09-30). Scope: `reviewer-core/`, `server/`.
> No DB, no `@devdigest/shared` contract, no client change. EARS acceptance criteria in §8.
> Revision 2026-09-30 applies owner decisions on architecture review AR-1…AR-6 and resolves §12.

## 1. Summary

Every LLM call DevDigest makes should leave one structured, content-free line in
the server's pino stdout. The line says which prompt sections went in, where each
came from, and how big each was (chars + tokens). It also names the provider/model
and carries IDs that tie it to the run and the HTTP request. Today the only trace of
prompt composition is two human-readable Live Log lines, neither with a per-call ID:
the reviewer's per-run "Reviewer prompt composition — …" (`server/src/modules/reviews/run-executor.ts:240-249`)
and the intent classifier's line (`server/src/modules/intent/service.ts:121-135`).
Both are aggregated or partial, and the conventions extractor logs nothing
(`server/src/modules/conventions/service.ts:105-114`).

This spec adds one record, `event: "prompt.assembled"`, `v: 1`, per LLM call at
all three call sites. The record is built field by field from measurements, so it
cannot carry prompt text. There are three modes, `PROMPT_LOG=off|summary|verbose`.
`summary` is the default. `verbose` adds process-local content fingerprints, item
*names* (skill names, doc refs, file paths) and the OpenRouter `session_id`. It never
adds content, and it only takes effect on a developer machine. pino also gets a
`redact` list as a second line of defence against secrets.

**Out of scope:**
- persisting records to the DB, `run_traces`, or `run_traces.prompt_assembly` (unchanged);
- sending records over SSE / RunLogger / the Live Log UI (only a `call_id` is appended to two existing Live Log messages);
- any client/UI change;
- logging the LLM *response* or its token usage (the run trace already does that);
- adding an `API_HOST`/bind-address setting or a loopback check (rejected, §12 R-Q1);
- the CI agent-runner outside `server/` (it gets the new optional hook but no emitter).

## 2. Decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | **Cover all three LLM call sites**: reviewer (per chunk), intent classifier, conventions extractor. | Conventions gets a logger parameter it does not have today (C5/C6). |
| D2 | **The caller builds the record from sections that reviewer-core exposes.** Adapters (`reviewer-core/src/llm/openrouter.ts`, `server/src/adapters/llm/*`) are untouched, because they see `messages`, not sections. reviewer-core stays pure: `assemblePrompt` additionally returns `sections` (name + text + item count), and `ReviewInput` gains an optional `onPromptAssembled` hook called once per chunk, right before `completeStructured`. Intent already has `onPrompt` (`reviewer-core/src/intent/classify.ts:167,188`), so the classifier needs no core change. | No I/O or logging in reviewer-core. The CI runner can ignore the hook. |
| D3 | **Emitter lives in infrastructure**: NEW `server/src/platform/prompt-log.ts`. It contains the section allowlist, the per-boot fingerprint key, a pure `buildPromptRecord()` and `emitPromptAssembled()`. The emitter wraps everything in `try/catch` and never throws, so logging can never fail an LLM call. It writes to **pino directly** (`logger.info(record, 'prompt.assembled')`), never through `RunLogger`: RunLogger's `data` also goes to SSE and is never persisted (`server/src/platform/run-logger.ts:50-53`, `server/INSIGHTS.md` 2026-09-30). | Services (application ring) import only the platform function plus a `PinoLike` logger, the same as `intent/service.ts:5` does today. |
| D4 | **Content-free by construction.** The builder copies named scalar fields one at a time and never spreads input objects. Per section it keeps `name`, `role`, `source`, `origin`, `chars` (`text.length`), `tokens` (`container.tokenizer.count(text)`) and `items`. Section text is measured and then dropped. Section names outside the fixed allowlist become `"other"`. | A future caller cannot leak content by passing extra fields. A test proves it with sentinels (AC-3). |
| D5 | **Record shape v1** (JSON keys snake_case, like the rest of the API). **Summary**: `event`, `v`, `call_id` (NEW `randomUUID()` per LLM call), `feature` (`review`\|`intent`\|`conventions`), `provider`, `model`, `mode`, plus these correlation fields when known: `run_id`, `run_ids`, `pr_id`, `repo_id`, `agent`, and `chunk: {index, count}` (review only; index 0-based, no path). Also `sections[]` and `totals: {chars, tokens, sections}`. **Verbose only** (AR-2): `session_id` (the `${owner}/${name}#${n}:…` string names a private repo), `chunk.path`, and per-section `fingerprint` + `item_names`. `request_id` is **not** a record field: callers pass Fastify's `req.log`, a pino child logger that already stamps every line with `reqId`. | Summary correlation uses `run_id`/`run_ids`, `pr_id`, `agent`, `call_id` and `reqId`, and names no repo. |
| D6 | **`source` is the trust boundary; `origin` says where the text came from.** `source` ∈ `trusted`\|`untrusted`. `origin` ∈ `agent_config`, `app`, `skill`, `memory`, `spec`, `pr_title`, `pr_body`, `issue`, `repo_doc`, `url`, `unresolved_refs`, `derived`, `repo_code`, `diff`, `file_list`. The reviewer `task` section is `untrusted`/`pr_title`, because `taskLine()` embeds the PR title and author (`server/src/modules/reviews/helpers.ts:82-84`). The full table is in §6.1. | The allowlist is where section → trust gets decided, in one place. |
| D7 | **Mode config**: `PROMPT_LOG` in the zod env schema (`server/src/platform/config.ts:15`), `'' → undefined`, enum `off\|summary\|verbose`, **unset/empty = `summary`**. An invalid value fails boot, because `EnvSchema.parse` throws. `AppConfig.promptLog = { requested, effective, downgradeReason }`. `.env.example` ships `PROMPT_LOG=` (empty) and **must never ship `verbose`**. | Same pattern as `LOG_LEVEL` (`config.ts:35-38`). |
| D8 | **Verbose gate (AR-6)**: `effective = 'verbose'` iff `PROMPT_LOG=verbose` **and** `NODE_ENV=development` **and** `CI` unset/empty. Otherwise the mode drops to `summary`, and `buildApp` logs exactly **one** `warn` at boot with the reason. This gate **guards against accidental enablement; it is not a security boundary**. Verbose output is safe to leak by design (D9: names and process-local HMACs, never content). There is no loopback/bind-address check (§12 R-Q1). | A CI job or production (`NODE_ENV=production`/`test`) that inherits `PROMPT_LOG=verbose` gets summary plus a warning. |
| D9 | **Verbose adds names and process-local fingerprints, never content (AR-1)**. `fingerprint` = the first 8 lowercase hex chars of **HMAC-SHA256(key, text)**. `key` is 32 random bytes from `crypto.randomBytes`, generated **once at module load** of `prompt-log.ts`, held in a module-private `const`, and never logged, exported or persisted. So fingerprints can be compared **within one process only**: the same text gives the same fp until restart. They cannot serve as a dictionary oracle (a plain hash of a guessable string such as a known file would be one). `item_names`: review → skill names parsed from the `### <name>` block header, plus `chunk.path`; intent → issue refs, doc repo paths, URLs passed through `redactUrl` (`server/src/modules/intent/helpers.ts:111`); conventions → sampled file paths (**paths only**, §12 R-Q2). `item_names` is capped at 50 entries × 200 chars. | Local debugging can tell *which* skill/doc/file was in a prompt, and whether two calls sent the same section, without logging any of it. |
| D10 | **Defence in depth with pino `redact` (AR-3)**: NEW `server/src/platform/log-redact.ts` exports the path list (§6.3), wired into the Fastify logger options at `server/src/app.ts:50-58` with `censor: '[redacted]'`. Paths cover top-level/one-level keys that app code logs (`authorization`, `apiKey`, `token`, `password`, `secret`, and their `*.` forms) plus explicit `err.*` paths for SDK/HTTP error shapes that pino's `err` serializer copies. `req.headers.*` is **kept only as a harmless defence**: Fastify's default `req` serializer logs `method/url/host/remoteAddress/remotePort`, never headers. `req.url` is **not** redacted: no route declares a `querystring` schema (`rg "querystring:" server/src/modules` → none), secrets arrive in bodies, and pino `redact` can only censor a whole value. | Covers error objects, the realistic leak path. Record keys never collide with it: `tokens` ≠ `token`. |
| D11 | **Live Log gets the `call_id`**: the reviewer composition message (`run-executor.ts:246`) appends ` · call_id=<id>` (single-pass) or ` · call_ids=<first>… (+N)` (map-reduce). The intent message (`intent/service.ts:132`) appends ` · call_id=<id>`. When the mode is `off`, nothing is appended. | A user can copy an ID from the UI and grep stdout. Conventions has no Live Log, so nothing is appended there. |
| D12 | **Level `info`**. With `NODE_ENV=test` the config's `logLevel` is `silent` (`config.ts:79`), so test output does not change. | One extra stdout line per LLM call in dev. |
| D13 | **Logger types (AR-5)**. `emitPromptAssembled` takes `Pick<PinoLike,'info'\|'warn'>`. `IntentPromptLogCtx.logger` and conventions `extract`'s logger are `Pick<PinoLike,'info'\|'warn'\|'error'>`. `IntentService.recompute` **widens** its param from `Pick<PinoLike,'info'\|'error'>` (`intent/service.ts:53`) to `Pick<PinoLike,'info'\|'warn'\|'error'>`, so it can forward to the emitter. The only caller passes `req.log` (`intent/routes.ts:35`), which satisfies it; `pinoIntentLog` keeps its narrower param. | No cast needed. The emitter can log its own failure at `warn`. |

## 3. What already exists — do not rebuild

| Layer | Already there | File |
|-------|---------------|------|
| Core | `assemblePrompt` builds every reviewer section (names/order are the allowlist source). System = `${parts.system}\n\n${INJECTION_GUARD}`, user = `userSections.join('\n\n')` | `reviewer-core/src/prompt.ts:111-170` (join at `:154-155`) |
| Core | Intent sections with a typed name union + `onPrompt` hook fired before the LLM call | `reviewer-core/src/intent/classify.ts:41-44,167,188` |
| Server | Token counter on the container (`tokenizer.count`) with a `chars/4` fallback | `server/src/adapters/tokenizer/index.ts:16-39`, `server/src/platform/container.ts:132` |
| Server | URL redaction helper (creds/query/fragment stripped) | `server/src/modules/intent/helpers.ts:111` |
| Server | `PinoLike` logger type (reuse; do not redefine) | `server/src/platform/run-logger.ts:21-26` |
| Server | `req.log` already reaches `ReviewService.runReview` → `executeRuns` and `IntentService.recompute` | `server/src/modules/reviews/routes.ts:41`, `reviews/service.ts:107,133`, `intent/routes.ts:35` |
| Server | Env flag pattern (zod field → `AppConfig` field → `.env.example`) | `server/src/platform/config.ts:28,35-38,79-80`, `server/.env.example:19-27` |

Nothing pre-staged for the feature itself. Verified by `rg -n "prompt\.assembled|PROMPT_LOG|prompt-log|onPromptAssembled|PromptMeasure|redact"` (repo-wide, excluding `server/clones/**`, `node_modules`): the only hits are spec 08 and `redactUrl`. Also, `app.ts` has no `redact` (`server/src/app.ts:46-60`) and `server/package.json` has no direct `pino` dependency (only `fastify` and `pino-pretty`).

### Code map — files this change touches

| File | Why it changes | Anchor |
|------|----------------|--------|
| `reviewer-core/src/prompt.ts` | add `ReviewPromptSection` + `sections` on `AssembledPrompt` | `reviewer-core/src/prompt.ts:101-104,111-170` |
| `reviewer-core/src/review/run.ts` | `ReviewInput.onPromptAssembled` + call per chunk | `reviewer-core/src/review/run.ts:45-99,179-187` |
| `reviewer-core/src/index.ts` | export new types | `reviewer-core/src/index.ts:15-21` |
| `reviewer-core/test/prompt.test.ts` | sections + message-equality invariant tests | existing file |
| `reviewer-core/test/run.test.ts` | hook-per-chunk tests | `reviewer-core/test/run.test.ts:45-55` |
| `server/src/platform/config.ts` | `PROMPT_LOG` + `resolvePromptLog` + `AppConfig.promptLog` | `server/src/platform/config.ts:15-39,41-60,62-81` |
| `server/.env.example` | document `PROMPT_LOG=` (empty) | `server/.env.example:25-27` |
| `server/src/platform/log-redact.ts` | NEW redact path list | NEW |
| `server/src/app.ts` | pino `redact` + one boot warn on downgrade | `server/src/app.ts:46-60` |
| `server/src/platform/prompt-log.ts` | NEW allowlist, per-boot HMAC key, builder, emitter | NEW |
| `server/src/modules/reviews/run-executor.ts` | pass `logger` to `runOneAgent`; wire hook; `call_id` in msg; pass prompt-log ctx to intent | `run-executor.ts:114,125,149-157,209-249` |
| `server/src/modules/intent/service.ts` | optional prompt-log ctx on `forReview`/`derive`; widen `recompute` logger; emit in `onPrompt`; `call_id` in msg | `intent/service.ts:50-61,69-99,121-135` |
| `server/src/modules/conventions/service.ts` | `extract(…, logger?)`; emit before `completeStructured` | `conventions/service.ts:88,105-114` |
| `server/src/modules/conventions/routes.ts` | pass `req.log` | `conventions/routes.ts:48` |
| `server/test/prompt-log.test.ts` | NEW hermetic: builder, HMAC, emitter, config matrix, redact via `app.inject` | NEW |
| `server/test/intent-service.test.ts` | one record per classifier call, no sentinels | `server/test/intent-service.test.ts:36-65` |
| `server/test/reviews.it.test.ts` | one record per chunk via spy logger | `server/test/reviews.it.test.ts:113-125` |
| `server/test/conventions.it.test.ts` | one record per extract via spy logger | `server/test/conventions.it.test.ts:108-115` |

## 4. Data model

No change. No schema edit, no migration (T4 not triggered).

## 5. Contracts (`@devdigest/shared`)

No change. The record is a log line, not an API contract, so neither
`server/src/vendor/shared/` nor `client/src/vendor/shared/` is edited (T1/T6 not
triggered). `PromptAssembly` (`server/src/vendor/shared/contracts/trace.ts:39-55`) stays as it is.
The record's TypeScript type lives server-side in `platform/prompt-log.ts`.

## 6. Server (and core)

### 6.0 reviewer-core (domain ring — no I/O, no logging)

- `prompt.ts`: new exported types
  `ReviewPromptSectionName = 'system'|'task'|'pr_description'|'skills'|'memory'|'repo_map'|'specs'|'callers'|'intent'|'diff'`
  and `interface ReviewPromptSection { name: ReviewPromptSectionName; text: string; items: number }`.
  `AssembledPrompt` gets `sections: ReviewPromptSection[]` in render order, with `system` first.
  - `sections[0].text` is exactly the `system` string (`${parts.system}\n\n${INJECTION_GUARD}`).
  - Each later section's `text` is **exactly** the string pushed into `userSections` at the same point (`prompt.ts:131-153`), including its `## …` header and delimiters, so the invariant in A4 holds by construction. The simplest way: push `{name, text}` into a parallel array wherever `userSections.push(x)` happens, then derive `user` from that array.
  - `items`: skills → `parts.skills.length`, memory → `parts.memory.length`, specs → `parts.specs.length`, otherwise 1.
  - `messages` and `assembly` stay byte-identical.
- `review/run.ts`: `ReviewInput.onPromptAssembled?: (p: { chunkIndex: number; chunkCount: number; chunkLabel: string; mode: ReviewMode; sections: ReviewPromptSection[] }) => void`.
  It is called once per loop iteration, after `assemblePrompt` (`:179`) and before
  `completeStructured` (`:180`), inside `try { … } catch { /* observability hook must not fail a review */ }`.
  Use `for (const [i, chunk] of chunks.entries())` for the index.

### 6.1 `server/src/platform/prompt-log.ts` — NEW (infrastructure ring)

Imports: `node:crypto` (`randomUUID`, `randomBytes`, `createHmac`), `type Tokenizer` from
`../adapters/tokenizer/index.js`, `type PinoLike` from `./run-logger.js`, `type AppConfig` from `./config.js`. No Drizzle, no Fastify.

Module-private state: `const FP_KEY = randomBytes(32);`. It is created at module load (once per process), **not exported**, and never logged or persisted.

Exports:
- `type PromptLogMode = 'off' | 'summary' | 'verbose'` (re-exported from config).
- `SECTION_REGISTRY: Record<Feature, Record<string, { role: 'system'|'user'; source: 'trusted'|'untrusted'; origin: Origin }>>`. The values:

  | feature | name | role | source | origin |
  |---|---|---|---|---|
  | review | system | system | trusted | agent_config |
  | review | task | user | untrusted | pr_title |
  | review | pr_description | user | untrusted | pr_body |
  | review | skills | user | trusted | skill |
  | review | memory | user | trusted | memory |
  | review | repo_map | user | untrusted | repo_code |
  | review | specs | user | untrusted | spec |
  | review | callers | user | untrusted | repo_code |
  | review | intent | user | untrusted | derived |
  | review | diff | user | untrusted | diff |
  | intent | system | system | trusted | app |
  | intent | title | user | untrusted | pr_title |
  | intent | body | user | untrusted | pr_body |
  | intent | issues | user | untrusted | issue |
  | intent | docs | user | untrusted | repo_doc |
  | intent | urls | user | untrusted | url |
  | intent | unresolved | user | untrusted | unresolved_refs |
  | intent | file_list | user | untrusted | file_list |
  | conventions | system | system | trusted | app |
  | conventions | repo_sample | user | untrusted | repo_code |

  An unknown name maps to `{ name: 'other', role: 'user', source: 'untrusted', origin: 'other' }`.
- `fingerprint(text: string, key: Buffer = FP_KEY): string` returns `createHmac('sha256', key).update(text).digest('hex').slice(0, 8)`. It is exported **for tests only**. The `key` param lets tests show that a different key gives a different fp; production callers never pass a key.
- `interface PromptSectionInput { name: string; text: string; items?: number; itemNames?: string[] }`.
- `interface PromptLogCall { feature; provider: string; model: string; sections: PromptSectionInput[]; runId?; runIds?; prId?; repoId?; agent?; sessionId?; chunk?: { index: number; count: number; path?: string } }`.
- `buildPromptRecord(call, mode: 'summary'|'verbose', tokenizer, callId): PromptAssembledRecord`. This is pure. Every output field is assigned explicitly, with **no `...spread` of `call` or of a section**. `session_id`, `chunk.path`, and each section's `fingerprint` (via `fingerprint(text)`) and `item_names` are added **only when `mode === 'verbose'`**, with `item_names` capped at 50 entries × 200 chars. In summary, `sessionId` and `chunk.path` are read by nobody.
- `emitPromptAssembled(logger: Pick<PinoLike,'info'|'warn'> | undefined, mode: PromptLogMode, tokenizer: Tokenizer, call: PromptLogCall): string | null`. It returns `null` when `logger` is undefined or `mode === 'off'`. Otherwise it creates the `call_id`, then builds and logs `logger.info(record, 'prompt.assembled')` and returns the id. The whole body sits in `try/catch`. On a caught error it attempts `logger.warn({ event: 'prompt.assembled.failed', err: (e as Error).name }, …)` inside its own try, and returns `null`. It never logs the error message, which could echo input.
- `promptLogMode(container: { config?: AppConfig }): PromptLogMode` returns `container.config?.promptLog.effective ?? 'off'`. The optional chaining matters because hermetic tests pass partial containers (`server/test/intent-service.test.ts:41-52`).

### 6.2 `server/src/platform/config.ts` (infrastructure)

- EnvSchema: `PROMPT_LOG: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['off','summary','verbose']).optional())`.
- `AppConfig.promptLog: { requested: PromptLogMode; effective: PromptLogMode; downgradeReason: string | null }`. Define `PromptLogMode` here, so config does not import prompt-log; prompt-log re-exports it.
- Exported pure `resolvePromptLog(requested: PromptLogMode | undefined, nodeEnv: AppConfig['nodeEnv'], ci: string | undefined)`: `requested ?? 'summary'`. If the result is `verbose` and (`nodeEnv !== 'development'` **or** `ci` is non-empty), it returns `effective: 'summary'` with reason `"PROMPT_LOG=verbose ignored: requires NODE_ENV=development and CI unset"`. `loadConfig` calls it with `parsed.PROMPT_LOG`, `parsed.NODE_ENV` and `env.CI` (`config.ts:62-81`).

### 6.3 `server/src/app.ts` + NEW `server/src/platform/log-redact.ts` (infrastructure)

- `log-redact.ts` exports `LOG_REDACT = { paths, censor: '[redacted]' }`, with `paths`:
  - app-logged objects: `authorization`, `*.authorization`, `apiKey`, `*.apiKey`, `token`, `*.token`, `password`, `*.password`, `secret`, `*.secret`;
  - error shapes (pino's `err` serializer copies enumerable props): `err.details.raw`, `err.request.headers.authorization`, `err.request.headers.Authorization`, `err.config.headers.Authorization`, `err.config.headers.authorization`, `err.response.config.headers.Authorization`, `err.response.config.headers.authorization`, `err.headers.authorization`, `err.headers.Authorization`;
  - defence only, with a code comment saying Fastify's default `req` serializer does not log headers today: `req.headers.authorization`, `req.headers.cookie`.

  `req.url` is not redacted (D10).
- `app.ts:50-58`: add `redact: LOG_REDACT` to the logger options object.
- After `const app = Fastify(…)`, add: `if (config.promptLog.downgradeReason) app.log.warn({ event: 'prompt_log.downgraded' }, config.promptLog.downgradeReason)`. `buildApp` runs once per process, so this is exactly one warn.

### 6.4 Call sites (application ring — use the platform function, no new I/O)

- **Reviewer**, `server/src/modules/reviews/run-executor.ts`:
  - `runOneAgent` gets a trailing `logger?: Logger` param (`:149-157`), and the call at `:125` passes the `logger` from `executeRuns` (`:62`). `Logger` has `info/warn/error/debug` (`:21-26`), so it satisfies the emitter.
  - In the `reviewPullRequest({...})` input (`:209-237`), add an `onPromptAssembled` handler. It calls `emitPromptAssembled(logger, promptLogMode(this.container), this.container.tokenizer, { feature: 'review', provider: agent.provider, model: agent.model, runId, prId: pull.id, repoId: pull.repoId, agent: agent.name, sessionId, chunk: { index, count, path: chunkLabel }, sections: p.sections.map(s => ({ name: s.name, text: s.text, items: s.items, itemNames: s.name === 'skills' ? skillNames : undefined })) })`. It pushes the non-null id into a local `callIds: string[]`.
  - `skillNames = skillBlocks.map(b => b.slice(4, b.indexOf('\n') < 0 ? undefined : b.indexOf('\n')))`. Blocks are built as `### ${skill.name}\n…` (`:374`).
  - Hoist `const sessionId = \`${repo.owner}/${repo.name}#${pull.number}:${agent.name}\`` so `:232` and the hook share it. The builder emits it in verbose only.
  - Append the D11 suffix to the message at `:246` when `callIds.length > 0`.
  - Intent call at `:114`: pass a 6th arg `{ logger, runIds: jobs.map(j => j.runId) }`.
- **Intent**, `server/src/modules/intent/service.ts`:
  - NEW exported type `IntentPromptLogCtx = { logger?: Pick<PinoLike,'info'|'warn'|'error'>; runIds?: string[] }`.
  - `forReview(…, log, promptLog?: IntentPromptLogCtx)` forwards it to `derive`.
  - `derive(…, log, promptLog?)`.
  - `recompute(…, logger: Pick<PinoLike,'info'|'warn'|'error'>)` (widened, D13) passes `{ logger }` to `derive` (`:60`).
  - Inside the existing `onPrompt` (`:121`), call `emitPromptAssembled(promptLog?.logger, promptLogMode(this.container), tokenizer, { feature: 'intent', provider: choice.provider, model: choice.model, prId: pull.id, runIds: promptLog?.runIds, sessionId: <:120 string>, sections: sections.map(s => ({ name: s.name, text: s.text, itemNames: namesFor(s.name) })) })`.
  - `namesFor`: issues → `collected.filter(c => c.kind==='issue' && c.status==='used').map(c => c.ref)`; docs → the same for `repo_doc`; urls → the same for `url`, passed through `redactUrl`; otherwise undefined.
  - Append ` · call_id=<id>` to the message at `:132` when the id is non-null.
- **Conventions**, `server/src/modules/conventions/service.ts`:
  - `extract(workspaceId, repoId, logger?: Pick<PinoLike,'info'|'warn'|'error'>)`.
  - Build `const userMessage = buildExtractionUserMessage(repoLabel, sample)` once and reuse it in `messages`, so the content sent is unchanged.
  - Before `llm.completeStructured` (`:108`), call `emitPromptAssembled(logger, promptLogMode(this.container), this.container.tokenizer, { feature: 'conventions', provider: choice.provider, model: choice.model, repoId, sections: [{ name: 'system', text: EXTRACTION_SYSTEM_PROMPT }, { name: 'repo_sample', text: userMessage, items: used.length, itemNames: used.map(f => f.path) }] })`.
- **Conventions route**, `server/src/modules/conventions/routes.ts:48` (presentation): `service.extract(workspaceId, req.params.id, req.log)`. There is no new route, and auth/authz/validation are unchanged (`getContext` + `IdParams` already there, `:46-47`). T5 is not triggered.

## 7. Client

No change.

## 8. Acceptance criteria (EARS)

- **AC-1** When the reviewer makes an LLM call, the server shall emit exactly one `prompt.assembled` record for that call. Single-pass gives 1 record; map-reduce over N files gives N records with `chunk.index` 0…N-1 and `chunk.count` N. Each record carries `feature:"review"`, `provider`, `model`, `run_id`, `pr_id`, `agent`, a unique `call_id`, and `sections[]` whose names are a subset of the review allowlist, each with `chars` and `tokens`.
- **AC-2** When the intent classifier or the conventions extractor makes its LLM call, the server shall emit exactly one `prompt.assembled` record with `feature:"intent"` (with `run_ids` when inside a review run) or `feature:"conventions"` (with `repo_id`), respectively.
- **AC-3** The emitted record, serialized to JSON, shall contain none of these sentinels: a diff line, PR body text, doc/spec body text, a skill body, a repo-sample line, or a fake API key. This holds for input sections that contain all of them, in both `summary` and `verbose` mode. In `summary` mode the record shall also contain neither `session_id` nor the repo owner/name sentinel.
- **AC-4** Where `PROMPT_LOG` is unset or empty, the system shall run in `summary` mode. Where `PROMPT_LOG=off`, it shall emit no record and append no `call_id` to Live Log messages. Where `PROMPT_LOG` is any other invalid value, `loadConfig` shall throw.
- **AC-5** Where `PROMPT_LOG=verbose`, `NODE_ENV=development` and `CI` unset, records shall add `session_id`, per-section `fingerprint` (8 lowercase hex) and `item_names`, and the review record shall add `chunk.path`. Where `PROMPT_LOG=verbose` and either other condition fails, the effective mode shall be `summary` and `buildApp` shall log exactly one `warn` whose message states the reason.
- **AC-6** If building or writing the record throws, the LLM call and the run shall proceed and complete as if logging were off.
- **AC-7** When a request carries an `Authorization` header, or a handler throws an error whose enumerable properties include `details.raw`, `request.headers.authorization`, `config.headers.Authorization` or `response.config.headers.Authorization`, or app code logs an object with `authorization`/`apiKey`/`token`/`password`/`secret` at the top level or one level deep, the pino output shall contain none of those secret values and shall show `[redacted]` in place of each one that is logged.
- **AC-8** While the prompt-log mode is not `off`, the reviewer's "Reviewer prompt composition" Live Log message and the intent classifier's Live Log message shall include the `call_id`(s) of their records.
- **AC-9** For every `assemblePrompt` result, `messages[0].content === sections[0].text` and `messages[1].content === sections.slice(1).map(s => s.text).join('\n\n')` shall hold, so the sections describe exactly what is sent. `messages` shall be unchanged by this spec at all three call sites.
- **AC-10** In verbose mode, the same section text shall give the same `fingerprint` within one process. A different HMAC key shall give a different fingerprint, and the fingerprint shall not equal the first 8 hex chars of the plain `sha256(text)`.

## 9. Implementation plan

### Phase A — reviewer-core sections + hook (npm — T9)

| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| A1 | Add `ReviewPromptSectionName`, `ReviewPromptSection`, and `sections` on `AssembledPrompt`. Populate them in `assemblePrompt` per §6.0 (a parallel array filled at each `userSections.push`), without changing `messages`/`assembly`. | `reviewer-core/src/prompt.ts` | `onion-architecture`, `typescript-expert` | AC-1, AC-9 |
| A2 | Add `onPromptAssembled` to `ReviewInput` and call it per chunk inside try/catch, between `assemblePrompt` and `completeStructured`. | `reviewer-core/src/review/run.ts` | `onion-architecture`, `typescript-expert` | AC-1, AC-6 |
| A3 | Export `ReviewPromptSection`, `ReviewPromptSectionName` (and the hook's payload type, if named) from the prompt/run export blocks. | `reviewer-core/src/index.ts` | `typescript-expert` | AC-1 |
| A4 | Tests: section names/order for a full `PromptParts` (every optional part set) and for a minimal one (system + diff only); `items` counts. **Invariant** (AR-4), asserted for both inputs: `messages[0].content === sections[0].text` and `messages[1].content === sections.slice(1).map(s => s.text).join('\n\n')`. This matches the join at `prompt.ts:154-155`. Plus `assembly.user === messages[1].content`. | `reviewer-core/test/prompt.test.ts` | `typescript-expert` | AC-1, AC-9 |
| A5 | Tests: the hook fires once in single-pass and N times in map-reduce (use a low `mapThresholdLines`), each time before the matching `llm.calls` entry. A throwing hook does not fail the review. | `reviewer-core/test/run.test.ts` | `typescript-expert` | AC-1, AC-6 |

### Phase B — server platform: config, redact, emitter (pnpm — T9)

| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| B1 | Add the `PROMPT_LOG` zod field, `PromptLogMode`, `AppConfig.promptLog`, and exported `resolvePromptLog(requested, nodeEnv, ci)`. `loadConfig` sets `promptLog`. | `server/src/platform/config.ts` | `zod`, `onion-architecture` | AC-4, AC-5 |
| B2 | Add `PROMPT_LOG=` (**empty**) next to `LOG_LEVEL`, with a comment: values off/summary/verbose, empty = summary, verbose only with NODE_ENV=development and CI unset, never commit verbose. | `server/.env.example` | — | AC-4 |
| B3 | NEW `LOG_REDACT` constant with the §6.3 paths and the `req.headers` defence comment. | `server/src/platform/log-redact.ts` | `fastify-best-practices` | AC-7 |
| B4 | Add `redact: LOG_REDACT` to the logger options, plus the one-time downgrade `warn` after the `Fastify()` call. | `server/src/app.ts` | `fastify-best-practices` | AC-5, AC-7 |
| B5 | NEW module-private `FP_KEY`, `fingerprint`, `SECTION_REGISTRY`, `buildPromptRecord`, `emitPromptAssembled`, `promptLogMode` per §6.1 (session_id/chunk.path/fingerprint/item_names verbose-only). | `server/src/platform/prompt-log.ts` | `onion-architecture`, `typescript-expert` | AC-1..AC-6, AC-10 |
| B6 | NEW hermetic tests, detailed in the list below the table. | `server/test/prompt-log.test.ts` | `typescript-expert`, `fastify-best-practices` | AC-3..AC-7, AC-10 |

B6 test cases:
- **(a) Sentinels.** Sections contain `sk-or-v1-FAKEKEY`, `+added-SECRET-line`, `SPEC-BODY-SENTINEL` and `SKILL-BODY-SENTINEL`, and the call has `sessionId: 'SENTINEL-OWNER/SENTINEL-REPO#7:agent'`. Assert `JSON.stringify(record)` contains none of the body sentinels in either mode. In summary, also assert it has no `session_id` key and no `SENTINEL-OWNER`/`SENTINEL-REPO`.
- **(b)** An unknown section name becomes `other`.
- **(c)** Verbose adds `session_id`, `fingerprint` matching `/^[0-9a-f]{8}$/` and `item_names`. Summary has none of them and no `chunk.path`.
- **(d) HMAC (AR-1).** `fingerprint('x') === fingerprint('x')`. `fingerprint('x', randomBytes(32)) !== fingerprint('x')`. `fingerprint('x') !== createHash('sha256').update('x').digest('hex').slice(0,8)`. The key never appears in any emitted record.
- **(e)** `emitPromptAssembled` with a logger whose `info` throws returns `null` and does not throw.
- **(f)** Mode `off` makes no logger call.
- **(g) `resolvePromptLog` matrix.** unset → summary; verbose + development → verbose; verbose + production/test → summary with a reason; verbose + development + `CI=true` → summary. `loadConfig({ PROMPT_LOG: 'loud' })` throws.
- **(h) Redact through `app.inject` (AR-3).**
  1. Create `Fastify({ logger: { level: 'info', stream: <capturing Writable>, redact: LOG_REDACT } })`.
  2. Register a test route that does two things: it calls `req.log.info({ apiKey: 'K1', nested: { token: 'T1' } })`, and it throws an `Error` with `details = { raw: 'RAW-SECRET' }`, `config = { headers: { Authorization: 'Bearer CFG' } }`, `request = { headers: { authorization: 'Bearer REQ' } }` and `response = { config: { headers: { Authorization: 'Bearer RESP' } } }`.
  3. Register an `setErrorHandler` that logs `req.log.error({ err }, 'boom')`, or rely on Fastify's default 500 logging.
  4. `app.inject({ url: '/t', headers: { authorization: 'Bearer HDR' } })`.
  5. Assert the captured output contains none of `K1`, `T1`, `RAW-SECRET`, `Bearer CFG`, `Bearer REQ`, `Bearer RESP`, `Bearer HDR`, and does contain `[redacted]`.

### Phase C — wire the three call sites (pnpm)

| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| C1 | `runOneAgent(…, logger?)`, and pass `logger` at the `:125` call. | `server/src/modules/reviews/run-executor.ts` | `onion-architecture` | AC-1 |
| C2 | Hoist `sessionId`; compute `skillNames`; add the `onPromptAssembled` handler calling `emitPromptAssembled` (§6.4); collect `callIds`; append the D11 suffix to the `:246` message. | `server/src/modules/reviews/run-executor.ts` | `onion-architecture` | AC-1, AC-8 |
| C3 | Add `IntentPromptLogCtx` (logger `Pick<PinoLike,'info'\|'warn'\|'error'>`); widen the `recompute` logger param (D13); thread the optional ctx through `forReview`→`derive`, with `recompute` passing `{ logger }`; emit inside `onPrompt`; append `call_id` to the `:132` message. | `server/src/modules/intent/service.ts` | `onion-architecture`, `typescript-expert` | AC-2, AC-8 |
| C4 | Pass `{ logger, runIds: jobs.map(j => j.runId) }` as the 6th arg of `forReview` at `:114`. | `server/src/modules/reviews/run-executor.ts` | `onion-architecture` | AC-2 |
| C5 | `extract(workspaceId, repoId, logger?: Pick<PinoLike,'info'\|'warn'\|'error'>)`; hoist `userMessage`; emit before `completeStructured`. | `server/src/modules/conventions/service.ts` | `onion-architecture` | AC-2, AC-9 |
| C6 | Pass `req.log` to `service.extract`. | `server/src/modules/conventions/routes.ts` | `fastify-best-practices` | AC-2 |
| C7 | Hermetic: in `setup()`, add `config: { promptLog: { requested: 'summary', effective: 'summary', downgradeReason: null } }` to the fake container. New case: `derive(…, t.log, { logger: spy, runIds: ['r1'] })`. Assert exactly one `spy.info` with `event:'prompt.assembled'`, `feature:'intent'`, `run_ids:['r1']` and no `session_id`. Assert its JSON contains neither `DOC`, `added-line`, `TOPSECRET`, `acme` nor `widgets`. Assert the Live Log message contains that `call_id`. | `server/test/intent-service.test.ts` | `typescript-expert` | AC-2, AC-3, AC-8 |
| C8 | DB-backed: build the app with `config: { ...config(), promptLog: { requested:'summary', effective:'summary', downgradeReason:null } }`. Call `new ReviewService(app.container).runReview(ws, prId, [agent], spy)` (`reviews/service.ts:103-108`), wait for the run as the existing tests do (`:181`), then assert one `prompt.assembled` record per LLM call (`llm.calls.length`) with `feature:'review'` and `run_id` set. | `server/test/reviews.it.test.ts` | `drizzle-orm-patterns` (fixtures only) | AC-1 |
| C9 | DB-backed: same config override. Call `new ConventionsService(app.container).extract(ws, repoId, spy)` and assert exactly one `feature:'conventions'` record and no sampled file content in it. | `server/test/conventions.it.test.ts` | `drizzle-orm-patterns` (fixtures only) | AC-2, AC-3 |

## 10. Risks & gotchas

- **T9 package manager.** Phase A is **npm** (`reviewer-core/`); Phases B/C are **pnpm** (`server/`). No dependency is added in either: `node:crypto` is built in and redaction is pino's, via Fastify.
- **T8 secrets.** Nothing new is stored. API keys never enter a prompt section. The sentinel test (B6a) plus pino `redact` (D10, B6h) guard against regressions. `AppConfig` still holds no secret (`config.ts:8-13`). The HMAC key is generated in memory per boot and is not a configured secret; it must not be added to `AppConfig`, the env or `secrets.json`.
- **T1/T2/T3/T4/T5/T6/T7** are not triggered: no contract, schema, enum, migration, new route or agent-skills endpoint. `snake_case` applies only to the log record's keys (D5), and the TS input type `PromptLogCall` is camelCase; the builder maps between them.
- **R1 Spreads leak content.** A later edit that writes `{ ...section }` or `{ ...call }` into the record would put `text` (or `sessionId`) into stdout. D4 forbids spreads in `buildPromptRecord`, and B6a fails if text or the session sentinel appears. The reviewer should reject any spread there.
- **R2 The verbose gate is a guard against accident, not a security boundary.** `dotenv/config` (`config.ts:1`) loads `server/.env`, and developers' `.env` usually has `NODE_ENV=development` (`server/.env.example:25`). So verbose is only as local as the environment. That is acceptable because verbose output is safe by design: names only, `redactUrl`'d URLs, and HMAC fingerprints under a per-boot key that cannot be brute-forced offline (D9).
- **R3 Partial test containers.** `intent-service.test.ts` fakes the container without `config` (`:41-52`). `promptLogMode` uses optional chaining, and `emitPromptAssembled` returns before touching config when `logger` is undefined, so existing cases stay green.
- **R4 Tokenizer cost.** A tiktoken `count` over the whole diff now runs once per chunk, and the existing composition line counts again at `run-executor.ts:243`. That is acceptable (in-process, and the same cost the composition line already pays). Do not add caching in this spec.
- **R5 Background logging after the response.** `executeRuns` is fire-and-forget (`reviews/service.ts:133`), and `req.log` is used after the reply. Pino child loggers stay valid after the reply, which today's code already relies on (`run-executor.ts:120-142`).
- **R6 Redact coverage is path-exact.** pino `*.x` matches one level only, and `err.*` paths are listed explicitly (§6.3). A new SDK error shape with a secret deeper or under another key would not be caught. The primary control remains "never put secrets in logged objects". This spec does not add deep scanning.
- **R7 Boundary.** `prompt-log.ts` is infrastructure and may import `adapters/tokenizer`. Services import only `emitPromptAssembled`/`promptLogMode` and `PinoLike` from `platform/`, the same as `intent/service.ts:5`. reviewer-core imports nothing new.
- **R8 Fingerprints are per-process.** Two server restarts give different fingerprints for the same text. That is intended (AR-1). Do not "fix" it by persisting or configuring the key.

## 11. Verification

| # | Command | Expected |
|---|---------|----------|
| V1 | `cd reviewer-core && npm run typecheck` | clean |
| V2 | `cd reviewer-core && npm test` | green, incl. A4/A5 |
| V3 | `cd server && ./node_modules/.bin/tsc --noEmit` | clean |
| V4 | `cd server && ./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'` | green, incl. `prompt-log.test.ts`, `intent-service.test.ts` |
| V5 | `cd server && TEST_DATABASE_URL=… ./node_modules/.bin/vitest run .it.test --no-file-parallelism` | green, incl. C8/C9. This machine has no Docker, so point `TEST_DATABASE_URL` at a scratch DB on native Postgres. |
| V6 | `cd client && ./node_modules/.bin/tsc --noEmit` | clean (sanity; client untouched) |
| V7 | Live, local: start the API with `PROMPT_LOG=summary`, trigger a review on a small (1-file) PR, then `grep prompt.assembled` in stdout | one line per LLM call with `reqId`, `run_id`, `call_id`, allowlisted sections and no `session_id`; the Live Log composition line shows the same `call_id` (AC-1, AC-8). **Owner-approved 2026-09-30: one paid LLM call, ≈ $0.001. The implementer may run it once.** |
| V8 | Manual: boot with `PROMPT_LOG=verbose NODE_ENV=production` (set `API_PORT` to a free port if 3001 is taken) | one `warn` "PROMPT_LOG=verbose ignored…", records have no `fingerprint`/`session_id` (AC-5). No LLM spend. |
| V9 | Manual: boot with `PROMPT_LOG=loud` | boot fails with a zod error (AC-4). |

Per-AC map:
- AC-1: A5, C8, V7.
- AC-2: C7, C9.
- AC-3: B6a, C7, C9.
- AC-4: B6g, V9.
- AC-5: B6c/g, V8.
- AC-6: A5, B6e.
- AC-7: B6h.
- AC-8: C7, V7.
- AC-9: A4.
- AC-10: B6d.

## 12. Resolved (owner, 2026-09-30)

- **R-Q1 Loopback detection — rejected.** There is no `API_HOST` setting and no loopback check; the API keeps binding `0.0.0.0` (`server/src/server.ts:29`). Rationale: the bind address does not decide who reads the process's stdout, so it would be the wrong control. The concern behind it (verbose data being useful to an attacker) is removed by making verbose content-free with non-replayable HMAC fingerprints (D9), so the gate in D8 only has to prevent accidental enablement.
- **R-Q2 Conventions file paths in verbose — allowed.** Verbose `item_names` for `repo_sample` lists the sampled file paths (**paths only**, never content), capped per D9. Summary logs only the `items` count.
