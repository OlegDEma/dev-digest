# Research — Eval Pipeline (L06) — NOT the spec

Spec: `docs/specs/2026-10-29-eval-pipeline.md` (being written by spec-creator).
This file holds the subagent reports gathered in Round 1 (2026-10-29), condensed from the
subagents' final reports (tables trimmed; every `path:line` citation kept).

## R1 — investigator: is `verify:l06` defined anywhere?

**Answer: No.** `verify:l0X` appears nowhere in the working tree (excl. node_modules, `server/clones`, `.claude/worktrees`),
nor in readable git metadata. No root `package.json` in the working tree. Git objects are zlib-compressed, so history /
other branches could NOT be checked.

- `scripts/verify.sh:52,107` — generic verify, no lesson targets.
- `evals/package.json:7-17` — scripts `eval`, `eval:skills`, `eval:agents`, `eval:workflow`, `eval:quality`, `eval:compare`,
  `eval:repeat`, `eval:delta`, `eval:benchmark`, `eval:scaffold`; no `verify*` key.
- `evals/README.md:25-26` mentions `git merge upstream/l06-evals`; there is no `upstream` remote (`.git/config:8-10,51-53`);
  the equivalent is `neo/l06-evals` (`.git/packed-refs:48`), already merged into LO6 (`.git/logs/HEAD:47`).
- `README.md:87` L06 row: "Eval pipeline · Secret/Phantom gates · Plan Verifier · Export to CI" (no script name).
- Repo convention: not a monorepo workspace; each package has its own package.json (root `AGENTS.md`). A root
  `pnpm verify:l06` would need a new root `package.json` or to be run inside a package.
- Not searched: git object contents (`neo/Lesson-06-lab-finish:package.json`), per-branch reflogs, GitHub-side/course site.
- Suggested next check (shell): `git ls-tree -r neo/Lesson-06-lab-finish --name-only | grep package.json`;
  or ask the course author what `verify:l06` should run.

## R2 — investigator: diff sources for a persisted finding

- `pr_files.patch` nullable, stored as GitHub returns it (`f.patch ?? null`); no size check, no truncation handling.
  `server/src/adapters/github/octokit.ts:81-86` `pulls.listFiles({per_page:100})`, no pagination → only first 100 files stored;
  `:108-113` patch passed through; `files_count` stays correct (`:103`) so a mismatch is detectable.
  Writer: `server/src/modules/pulls/routes.ts:261-272` (inside `GET /pulls/:id`, `:239,257-259`, only when GitHub succeeds);
  fallback serves persisted rows (`:298-322`). Seed rows have null patch (`server/src/db/seed.ts:126-131`).
  `pr_files` table: `server/src/db/schema/pulls.ts:36-45`. No frequency data in repo.
- Diff-loader (`server/src/modules/reviews/diff-loader.ts:12-44`): git diff first, fallback `pr_files` patches.
  `pr_files.patch` is a snapshot of the last `GET /pulls/:id`, replaced wholesale, so it may describe a newer head than the review.
  Nothing stores the reviewed head sha on a review/finding (`schema/reviews.ts:18-35`; `markReviewed` at `run-executor.ts:334` records it on the PR).
  Findings store no diff/hunk (`review.repo.ts:29-55`, `schema/reviews.ts:37-55`).
- `FindingKind` = finding|secret_leak|lethal_trifecta|phantom|hook (`server/src/vendor/shared/contracts/findings.ts:17-23`;
  client copy `client/src/vendor/shared/contracts/findings.ts:19-22`). No hook/scanner code produces them — only the agent's
  LLM output (`seed-prompts.ts:143-147` tells the LLM when to set kind). So ALL findings from real runs have `reviews.agent_id`
  and `run_id` (`run-executor.ts:315-329`). Exception: the seeded demo review (`seed.ts:142-181`, no agent_id/run_id).
  `reviews.agent_id` has no FK (`schema/reviews.ts:26`); `findings.kind` is unvalidated text (`:51`).
  `HookKind` (`eval-ci.ts:266`) is a separate enum (secret_leak, phantom).
- Line range outside patch: possible for full-file kinds (`reviewer-core/src/grounding.ts:10-16,59`: file presence only) and for
  findings persisted before the gate. Non-full-file findings were hunk-intersected at review time (`grounding.ts:24-32,78`).
- Deleting a run: `deleteAgentRun` deletes the review by run_id first (`run.repo.ts:99-112`, no FK `reviews.run_id`),
  findings cascade (`schema/reviews.ts:41`). Deleting a PR cascades to reviews/pr_files. `deleteReview` (`review.repo.ts:100-110`)
  leaves the agent_runs row.
- Not searched: whether PR import writes `pr_files` (only `routes.ts:263` + seed found), GitHub's real omission threshold, CI-origin reviews, docs/INSIGHTS.

## R3 — investigator: can an eval run avoid polluting runs/reviews/findings?

- `reviewPullRequest` (`reviewer-core/src/review/run.ts:148`) is pure: only side effect is `input.llm.completeStructured` (`run.ts:211`);
  imports only shared/grounding/reduce (`run.ts:10-18`); `reviewer-core/AGENTS.md`: "Pure engine: no DB, GitHub, or filesystem".
  Input: `diff, llm, model, systemPrompt, skills?: string[], intent, task, sessionId, onEvent, checkCancelled`; returns outcome with
  `tokensIn, tokensOut, costUsd, grounding, review, assembly, raw` (`run-executor.ts:245-296`).
- The server wrapper `ReviewRunExecutor.runOneAgent` (`run-executor.ts:174-419`) persists inline: `agent_runs` (`service.ts:120`,
  `run.repo.ts:148-159`, source hardcoded 'local'), `reviews`/`findings` (`:318,329`), `markReviewed` (`:334`), `completeAgentRun`/
  `saveRunTrace`/`recordRunSkills` (`:343,390,214`), `intents.forReview` → `pr_intent` upsert (`:115-122`, `intent/service.ts:212`),
  and `loadDiff` needs a real PR row (`:103`). No skip flag. `buildSkillBlocks` is private (`:431`), writes `agent_run_skills` (`:450`);
  format is `### ${skill.name}\n${skill.body.trim()}` (`:440-449`); `enabledSkillsForPrompt` at `agents/repository.ts:225`.
  → Eval path should call `reviewPullRequest` directly and build skill blocks itself, with its own tables.
- Pollution map if agent_runs were reused: PR run timeline `GET /pulls/:id/runs` (`run.repo.ts:42-53`, `routes.ts:108`), active runs
  (`run.repo.ts:12-39`, `routes.ts:98-105`; MCP polls it `mcp/src/api/http.ts:49`), `reviewsForPull` (`service.ts:160-174`), PR list
  score/cost/chips (`pulls/routes.ts:121-184`), skills stats `runsInWindow`/`runMetrics` (`skills/repository.ts:152-189`).
  Agent card "N runs · X% accept · $avg", Agent Performance and Agent Stats are NOT wired today (contracts only:
  `observability.ts:96-119`, `productionize.ts:135-186`; `AgentCard.tsx:1-2` "Stats are an A5 mount"); if built on agent_runs later they'd count evals.
- Async pattern to mirror: row-first (`status:'running'`) then fire-and-forget (`service.ts:114-133`); status running|done|failed|cancelled
  (`run.repo.ts:118,130,167`), error in `error` (`:195`); SSE `GET /runs/:id/events` (`routes.ts:51-95`) over in-memory `RunBus`
  (`platform/sse.ts:19,103`); client polls every 4s (`client/src/lib/hooks/reviews.ts:33,45-46`); cancel (`service.ts:85-90`,
  `run-executor.ts:292-294`); boot reaper marks ALL running agent_runs failed with no error text (`app.ts:86-91`, `run.repo.ts:124-133`;
  single API instance assumption `app.ts:84-85`) — a separate eval table needs its own reaper. No concurrent-run guard anywhere
  (rate limit 10/min only, `routes.ts:32`). Another async mechanism: `platform/jobs.ts:62` (not read fully).
- LLM: `container.llm(provider)` (`container.ts:196-204`), key via `LocalSecretsProvider` (`:96,208,216,223`, `~/.devdigest/secrets.json`
  + env). Missing key → `ConfigError` (HTTP 500, `errors.ts:37-41`) at run time. Anthropic: `withRetry` 3 retries on 429/5xx
  (`anthropic.ts:101`, `resilience.ts:35-44`); OpenRouter SDK maxRetries 2 / 90s timeout (`openrouter.ts:52-57`); OpenAI adapter has no
  explicit retry (`openai.ts:53`, SDK defaults unverified). StructuredOutputError after repair attempts (`openrouter.ts:126`, `anthropic.ts:148`).
  Failures are persisted as failed run with `error=err.message` (`run-executor.ts:394-418`).
- New table → schema edit + `pnpm db:generate` migration; new contracts must land in BOTH vendor/shared trees.
- Not searched: `markReviewed` body, `intent/service` skippability, `adapters/mocks.ts` fake LLM, existing `eval-ci.ts` shapes, tests, docs/INSIGHTS.

## R4 — researcher: precision with labelled positives/negatives + unlabelled findings (confidence: medium)

- BC-Bench (Microsoft, https://microsoft.github.io/BC-Bench/code-review.html): precision = matched / scorable generated, where
  scorable = generated minus `ignored` matches; unmatched findings count as false positives. Reports micro (pooled) and macro
  (per-task mean). No pass/fail threshold seen.
- GitHub ReviewBench (https://github.blog/2026-01-14-reviewbench-an-open-benchmark-for-ai-code-review/, 2026-01-14): "grounded" metrics
  use only gold labels; "augmented" metrics have an LLM judge adjudicate unmatched findings. Micro/macro and per-case pass unspecified.
- Augment Code blog (competitor, snippet only): TP/FP/FN vs golden comments; weak evidence.
- scikit-learn: macro = equal weight per class; micro = pooled numerators/denominators.
- No tool found that reports a bare "unlabelled count" without judging it; no published small-N (8–20) guidance — below is inference.
- Recommendation (code-only, file equal + line ranges intersect, one-to-one greedy assignment):
  TP = findings matched to must_find; forbidden hits = findings matched to must_not_flag; unlabelled = matched to neither (report as a
  separate `unlabelled_count`). Headline precision (grounded) = TP / (TP + forbidden hits). Strict precision (lower bound) = TP / all
  emitted. Headline averaging = micro (pooled), macro secondary; always show raw counts. Per-case pass (own definition) = all must_find
  matched AND zero forbidden hits; unlabelled never fails a case.
- Unresolved: BC-Bench line-tolerance conflict (summary said none; a snippet said configurable).

## R5 — researcher: Part B runner tooling (2026-10-29; condensed)

- Artifacts: list `GET /repos/{o}/{r}/actions/runs/{run_id}/artifacts` (per_page ≤100; fields id,name,size_in_bytes,expired,created_at,expires_at);
  download `GET .../actions/artifacts/{id}/zip` → 302, URL valid 1 minute, 410 when expired; default retention 90 days (configurable).
  Needs repo read; `actions: read` for fine-grained tokens UNVERIFIED. Octokit method names (`listWorkflowRunArtifacts`, `downloadArtifact`) from memory, unverified.
  Adapter port has no artifact method today (`server/src/vendor/shared/adapters.ts:208-216`; no `actions.` usage in `server/src`).
- Unzip: `fflate@0.8.3` already a server dep (`server/package.json:30`, `server/src/modules/skills/helpers.ts:1` uses `unzipSync`). Not compared with adm-zip/yauzl.
- Bundler: `@vercel/ncc` 0.45.0 (handles tsconfig paths via tsconfig-paths-webpack-plugin); earlier branch `neo/lesson-7-lab/agent-runner`
  `agent-runner/insights/INSIGHTS.md` (2026-07-08) records `ncc build src/index.ts -o dist` inlining `@devdigest/reviewer-core`/`shared`/zod/openai into one file;
  `^0.38.3` resolved to 0.38.4 (pin for 0.45). esbuild 0.28.2 not evaluated head-to-head. `pnpm typecheck` in agent-runner fails with missing 'zod' unless reviewer-core/node_modules installed (not a workspace).
- YAML: `yaml` 2.9.1 (used by earlier runner branch, `"yaml": "^2.6.1"`); js-yaml 5.5.0 not compared. No YAML lib in `server/package.json` (server's `CiService.agentYaml` presumably hand-built — unverified).
- Posting: earlier runner branch posts reviews with plain `fetch` (no octokit/@actions deps, `X-GitHub-Api-Version: 2022-11-28`). Workflow `permissions:` = `contents: read`, `pull-requests: write`
  (unlisted scopes become none). Fork PRs get read-only tokens; earlier workflow skips forks (`github.event.pull_request.head.repo.fork == false`).
- `uses: owner/repo/subdir@ref` needs `action.yml` (location in subdir inferred, unverified), `runs.using` node20/node24; committed `dist` claim only from `.gitignore:3-6`;
  private-repo sharing needs Settings > Actions > Access (search snippet only).
- Prior design on branches: `agent-runner/` does NOT exist on LO6; exists on `neo/lesson-7-lab/agent-runner` and `neo/emdash/export-to-ci-4sp`
  (src/{artifact,context,diff,errors,github,index,manifest,run,skills}.ts; no action.yml; its own .gitignore ignores dist/, conflicting with root `.gitignore:3-6` un-ignore).
  `neo/devdigest/ci` instead COPIES the bundle into the target repo (`.devdigest/runner/index.js` + chunk `310.index.js`; workflow runs `node .devdigest/runner/index.js`, Node 22) —
  no `uses:`. That branch read `post_as` from env `DEVDIGEST_POST_AS` because `AgentManifest` lacked it (the C1 gap).
- `CiResultArtifact` (`devdigest-result.json`) has no run id/repo/url; server must derive them from the Actions API.
- Decisions still open from this research: `uses:` reference vs copying the bundle into the target repo (owner chose configurable `DEVDIGEST_RUNNER_REF`, default `OlegDEma/dev-digest/agent-runner@<tag>`).
