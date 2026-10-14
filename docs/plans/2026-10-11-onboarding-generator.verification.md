# Verification — Onboarding Generator (Onboarding Tour)

> Plan: [`2026-10-11-onboarding-generator.md`](2026-10-11-onboarding-generator.md) (rev 2, approved) ·
> Spec: [`../specs/2026-10-11-onboarding-generator.md`](../specs/2026-10-11-onboarding-generator.md) (rev 8, approved).
> Recorded 2026-10-11 by the main session (V30) from the `plan-verifier` report on the working tree
> (branch `LO5`, uncommitted), then updated after the `pr-self-review` fix round and V31.

## Verdict

| Source | Verdict |
|---|---|
| `plan-verifier` | **comment** — 77 of 78 ACs Met, 0 Not met; AC-69 partly Unverifiable (e2e half); NFR-10 Unverifiable before V31 |
| `architecture-reviewer` | **approve** — 0 CRITICAL / 0 WARNING, 1 SUGGESTION (A-1) |
| security review (`security` skill) | 0 CRITICAL, 2 WARNING (S-1, S-2), 3 SUGGESTION |
| `pr-self-review` (whole LO5 branch) | round 0: block (1 CRITICAL, Project Context, not this feature) → after fix round: **warn** (0 · 9 · 26) |

## Acceptance criteria

| AC | Status | Kind | Evidence |
|---|---|---|---|
| AC-1–4 | Met | test | `client/src/components/app-shell/helpers.test.ts` (NAV order, `activeKeyFor`, `repoSwitchTarget`); `NavItem.test.tsx`; `OnboardingTourView.test.tsx` "renders the stored tour of another repository…" (asserts the hook is called with `r2` after the fix round) |
| AC-5, 7 | Met | test | `OnboardingTourView.test.tsx` empty state; `TourHeader.test.tsx` |
| AC-6 | Met | test | `OnboardingTourView.test.tsx` "does not generate on open"; `server/test/onboarding.it.test.ts` AC-6 (0 LLM calls on read) |
| AC-8, 9 | Met | test | `onboarding/helpers.test.ts`, `TourHeader.test.tsx`, `onboarding.it.test.ts` AC-8/9/30, `onboarding-snapshot.it.test.ts` |
| AC-10–13 | Met | test | `helpers.test.ts` (`subtitleParts`, `statsParts`); `TourHeader.test.tsx` |
| AC-14, 15, 73 | Met | test | `OnboardingTourView.test.tsx` (TOC, focus to heading, `aria-expanded`); `TourSection.test.tsx` |
| AC-16 | Met | test | `TourSection.test.tsx`; server `buildSections` (skeleton → all `from_index`) |
| AC-17 | Met | test | `OnboardingTourView.test.tsx` Generating / Regenerating with the old tour kept |
| AC-18 | Met (weak) | test | IT "AC-33/EC-12 … GET sees the generation"; `lib/hooks/onboarding.test.tsx` (409 → invalidate). 3 s `refetchInterval` itself untested (PV-1) |
| AC-19–21 | Met | test | `OnboardingTourView.test.tsx`; `TourHeader.test.tsx` |
| AC-22 | Met | test | IT AC-22/EC-14 (gated, no sleep); `onboarding-snapshot.it.test.ts` |
| AC-23–26 | Met | test | IT skeleton reasons (no_clone, index_unavailable ×2, no_import_graph, llm_not_configured), 0 LLM/GitHub/embedding calls |
| AC-27 | Met | test+cmd | IT headline (one call); V29 |
| AC-28, 29 | Met | test | IT llm_failed / llm_invalid_output (attempts 3) / llm_timeout; `structured-output-error.test.ts` |
| AC-30 | Met | test | `onboarding-helpers.test.ts`; IT AC-8/9/30 |
| AC-31, 32 | Met | test | `TourBanners.test.tsx` (7 reasons); `TourHeader.test.tsx` (Partial reasons visible + accessible description) |
| AC-33, 34, 76 | Met | test | IT concurrency (gated: one 200 + 409s, one call); rate limit (11th POST → 429 `rate_limited`); 404 `repo_not_found` |
| AC-35, 36, 75, 78 | Met | test | IT keep-on-7-reasons, AC-78/EC-29 clear, AC-35 replace |
| AC-37–41 | Met | test | `onboarding-helpers.test.ts` (determinism, four commands, order 9, `fitFacts` ≤ 8,000 tokens) |
| AC-42–44 | Met | test | `onboarding-facts.test.ts`; `clone-files.test.ts`; IT `.env` sentinel absent |
| AC-45, 46 | Met | test | `onboarding-helpers.test.ts`; `ArchitectureBody.test.tsx` (skeleton stack + folders in `body_markdown`) |
| AC-47–51, 74 | Met | test | `onboarding-helpers.test.ts`; `FileRows.test.tsx` |
| AC-52–56, 77 | Met | test | `onboarding-helpers.test.ts` narrative merge (AC-77 counts only AC-54 drops); IT; `FirstTasks.test.tsx`; `TourSection.test.tsx` (texts byte-for-byte) |
| AC-57–59 | Met | test | `FileRows.test.tsx`; `RunCommands.test.tsx`; `helpers.test.ts` |
| AC-60 | Met | test | `onboarding-facts.test.ts` fence; IT system prompt keeps SECURITY paragraph |
| AC-61–63 | Met | test | `ArchitectureBody.test.tsx` (incl. invalid→different invalid diagram); `MermaidDiagram.test.tsx`; `FileRows.test.tsx` |
| AC-64, 66 | Met | test | IT logging (`PROMPT_LOG=off` → one `onboarding.generated`; shared `call_id`); `prompt-log-callid.test.ts` |
| AC-65 | Met | test | IT AC-65; `structured-output-error.test.ts` |
| AC-67 | Met (weak) | test | IT README/`.env` sentinels absent; whitelist test. `KEY_SENTINEL` never planted (PV-2) |
| AC-68 | Met | test | IT counting fakes |
| AC-69 | Met (server + live); e2e half not run | test + manual | IT headline; V31 live run (narrative, `llm_calls: 1`). e2e flow 09 written, V27 not run (no Docker → CI `e2e-web.yml`) |
| AC-70–72 | Met | test | `TourBanners.test.tsx`; `OnboardingTourView.test.tsx` |
| EC-1–29 | Met | via ACs | EC-22 by read: `resolveFeatureModel` per generation, never on GET |
| NFR-1, 2 | Met (single sample) | test + V31 | IT smoke bounds (1.5 s GET, 25 s 5,000-file skeleton); live timing in V31 |
| NFR-3–9 | Met | test | IT timeout, facts budget, 200 on llm_failed, sentinels, C5 record; i18n + roles |
| NFR-10 | Met | manual | V31: no page scroll at 1,024 px, prose wraps, command rows scroll |

## Verification commands (§11)

| # | Result |
|---|---|
| V1–V3 tsc (server, client, reviewer-core) | pass |
| V4 contract trees | identical (`onboarding.ts`, `StructuredOutputError`, `CloneFiles` blocks) |
| V5 migration 0017 | one `CREATE TABLE onboarding_generation_lock` + FK; applied on native PG 17 |
| V6–V8, V10–V12, V14 | pass (server 38 files / 359 tests; reviewer-core 54) |
| V9 onion grep | no matches |
| V13, V15, V16 IT | pass on a fresh scratch DB (onboarding files 89/89 ×3 runs after the fix round; full IT 123) |
| V17 | empty |
| V18–V25 client | pass (59 files / 310 tests after the fix round); V25 no use of the deleted contract |
| V26 | covered by `verify.sh --full server client reviewer-core` — pass |
| V27 e2e hermetic | **not run** — needs Docker; runs in CI `e2e-web.yml` |
| V28 | non-empty only from pre-existing LO5 edits; no onboarding lines in NG7 files |
| V29 | only 3 reporting lines `attempts: maxRetries + 1`; no retry count changed |
| V30 | this file |
| V31 | see below |

## Open findings left to the owner

- **S-1** `wrapUntrusted` closing-tag replace is case/whitespace-sensitive (`reviewer-core/src/prompt.ts:53`, shared).
- **S-2** no per-repo cooldown; 10 POST/min per IP in no-auth local mode.
- **D7** structured-output exhaustion in conventions/intent now answers 502 `internal_error` (plan-accepted).
- **D8** after `llm_timeout` the lock is released while the provider call may still bill (plan-accepted).
- **PV-1** polling interval untested · **PV-2** `KEY_SENTINEL` never planted · **PV-3** first-folder `dev`/`start`.
- **A-1** `relativeAgo` hardcodes `"en"`; S-3 `SAFE_DIR` accepts `..` (not reachable today).

## Deviations from the plan (accepted in review)

`onboarding/clone-facts.ts` added; prompt-log registry gains `onboarding` sections; `OnboardingIndexStats.hotnessAvailable`;
`useGenerateOnboardingTour(repoId)`; vendored `DefaultLink.tsx` forwards `aria-current` (2 lines); no `TourToc.test.tsx`;
section headings from client i18n (D19); `POLL_MS` lives in `lib/hooks/onboarding.ts`.

## V31 — live demo

Run 2026-10-11 by the main session: native Postgres 17, API `:3001` + web `:3000` (direct binaries), migrations applied.
Repo `ai-agentic-engineering-neo/dev-digest` (index `full`, 312/312 JS/TS files). Generated once through the UI at 1,024 px.

| Check | Result | AC / NFR |
|---|---|---|
| Nav item active on the tour route | yes | AC-2 |
| Empty state names the five sections in order; opening did not generate | yes (GET only, no `prompt.assembled`) | AC-5, AC-6 |
| Button shows "Generating…" while running | yes | AC-17 |
| `onboarding.generated` log line | `mode: narrative`, `completeness: full`, `llm_calls: 1`, `attempts: 1`, `provider: openrouter`, `model: deepseek/deepseek-v4-flash`, `tokens_in 6551 / out 2779`, `cost_usd 0.0011`, `facts_tokens 4845`, `dropped_ai_items 0`, `duration_ms 28125` | AC-64, AC-65, AC-69, AC-10 |
| `call_id` shared by `prompt.assembled` and `onboarding.generated` | yes (`32710627-…`); facts section `source: untrusted`, `origin: repo_code` | AC-66, AC-60 |
| Stored tour | narrative, 5 sections all `ai_written` (architecture + diagram, 8 critical paths, 6 commands, 10 reading items, 5 first tasks), `last_failure: null` | AC-27, AC-69, AC-78 |
| GET of the stored tour, 20 runs | p50 1.6 ms, p95 3.0 ms, max 7.4 ms; still exactly one `prompt.assembled` (no LLM call) | NFR-1, AC-6 |
| 1,024 px layout | no horizontal page scroll (`scrollWidth − clientWidth = 0`); prose wraps; Mermaid diagram rendered as SVG; command rows `white-space: pre` inside `overflow-x: auto` | NFR-10, AC-62 |

**V31 verdict:** pass. AC-69 live half and NFR-10 are now Met; only V27 (e2e in CI) remains not run.

**Observation for the owner (spec gap, not an implementation defect).** For this repo, "How to run locally" shows
`cd client && npm install`, `cd e2e && npm install`, `cd reviewer-core && npm install`, two `cp .env.example .env`,
`docker compose up -d`, `cd client && npm run dev`. That is exactly what AC-40 prescribes — one `{pm}` from the **root**
lockfile (none → `npm`) and at most 3 child folders **in path order** — but for a multi-package repo it is misleading:
`client/` and `server/` have `pnpm-lock.yaml`, and `server/` (the API) is cut by the 3-folder cap. Fixing it needs a spec
revision (per-folder package manager; a smarter folder choice than path order), then a plan change.
