# 04 — Conventions: extract a repo's house rules and turn them into a skill

> Status: **implemented** (2026-09-23). Cross-module:
> `server/` + `client/` (+ a read-only `repo-intel` touch-point and shared
> contracts). EARS acceptance criteria are in §8. The output of this feature is an
> ordinary skill, so [`03-skills.md`](03-skills.md) is the companion spec.

## 1. Summary

Scan a cloned repository for the **house rules it already follows**, show each one
with the code that proves it, let a maintainer accept / reject / edit them, and
merge the accepted set into a `repo-conventions` skill bound to a reviewing agent.

The design premise, from which everything else follows:

> **A model is good at noticing a pattern and bad at remembering where it saw it.**

So the model only ever *proposes*. Code chooses what it reads, and code verifies
what it claims.

```
 repo-intel + config wish-list     ONE cheap structured call      re-read the file
          │                                   │                          │
   ┌──────▼──────┐  line-numbered  ┌──────────▼─────────┐  candidates ┌───▼────┐  pending
   │   SAMPLE    ├────listing─────►│      PROPOSE       ├────────────►│ VERIFY ├─────────►
   │   (code)    │                 │      (model)       │             │ (code) │   rows
   └─────────────┘                 └────────────────────┘             └────────┘
```

## 2. Decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Sampling is **100 % code**, never a model call | deterministic cost, reproducible scan; the model cannot browse or choose files |
| D2 | The evidence gate is **code, not a second model** | a candidate whose snippet is not in the cited file is *dropped*, not "low-confidence" |
| D3 | The snippet shown in the UI is **re-read from the file** | the UI can never present a paraphrase as if it were code |
| D4 | A wrong line number is **corrected**, not fatal | miscounting is a formatting slip; inventing code is not |
| D5 | Triage is a three-state `status`, not a boolean | a re-scan replaces only `pending`, so a rejected rule is never re-litigated |
| D6 | The skill is a **draft** (`POST …/conventions/skill`), persisted only via `POST /skills` | same preview-then-confirm flow as skill import; the user edits everything before it exists |
| D7 | The scan reports `proposed` / `dropped_ungrounded` / `dropped_duplicate` | "3 of 12 kept" reads as *the gate worked*, not *the feature is broken* |
| D8 | The model comes from `FEATURE_MODELS.conventions` | picking a cheap model is a user setting, not a constant in code |
| D9 | Frequency is measured by **ripgrep**, not self-reported | the model proposes a probe; code runs it and counts (§5) |

## 3. What already exists — do not rebuild

The starter shipped the scaffolding and stopped before the module and the UI.

| Layer | Already there | File |
|-------|---------------|------|
| DB | `conventions` table (starter shape) | `server/src/db/schema/knowledge.ts:31` |
| Contracts | `ConventionCandidate` (starter shape) | `server/src/vendor/shared/contracts/knowledge.ts:211` |
| Sampling | `repoIntel.getConventionSamples(repoId, n)` | `server/src/modules/repo-intel/service.ts:630` |
| Model config | `FEATURE_MODELS.conventions` + `resolveFeatureModel` | `.../contracts/platform.ts:71`, `modules/settings/feature-models.ts:51` |
| i18n | part of the `conventions` namespace | `client/messages/en/conventions.json` |
| Routing | `activeKeyFor()` already maps `/conventions` | `client/src/components/app-shell/helpers.ts:31` |
| Test seam | `MockLLMOptions.structuredBySchema` names this feature's schemas | `server/src/adapters/mocks.ts:46` |

## 4. Data model

The `conventions` table gains `category`, `rationale`, `evidence_line`,
`occurrences`, `status` and `created_at`; the `accepted` boolean is replaced by
`status` (D5). Index `conventions_repo_created_idx` on `(repo_id, created_at)`.

`text({ enum })` narrows TypeScript only, so both enums are mirrored into Postgres
as `CHECK` constraints — the same rule the review pipeline's columns follow.

## 5. Server — `src/modules/conventions/`

```
GET    /repos/:id/conventions          → candidates for the repo
POST   /repos/:id/conventions/extract  → scan (one model call)
POST   /repos/:id/conventions/skill    → skill DRAFT from accepted (writes nothing)
PATCH  /conventions/:id                → accept / reject / edit
DELETE /conventions/:id                → drop a candidate
```

### 5.1 SAMPLE (stage 1, no model)

`CONFIG_SAMPLE_PATHS` (package.json, tsconfig, eslint/prettier/editorconfig,
CONTRIBUTING/AGENTS/CLAUDE.md) — missing ones are skipped silently — followed by
`repoIntel.getConventionSamples(repoId, 12)`, then a **layered pass** that buckets
ranked paths by kind (route / service / repository / component / test) and takes
the top-K per bucket. Each file is truncated to 220 lines / 12 000 chars, the whole
sample to 90 000 chars, and rendered with a **1-based line-number gutter** — that
gutter is what makes a citation checkable. A repo with nothing readable 422s
("clone and index it first") **before** any model call.

Layered sampling and the inclusion of tests are deliberate departures from the
review-context sampler: `getConventionSamples` drops `.test.`/`.spec.` via
`isJunkPath`, which is right for review context and wrong here — testing
conventions are among the most useful rules and are otherwise invisible.

### 5.2 PROPOSE (stage 2, the only model call)

One `completeStructured` at `temperature 0.1`, `schemaName: 'ConventionExtraction'`.

**Schema field order is load-bearing.** Field order is generation order: a model
that writes `category` first commits to a label before it knows what it is about to
say. So everything it must *observe* precedes everything it must *judge*:

```
rule → evidence_path → evidence_line → evidence_snippet → probe
     → occurrences_seen → rationale → category → confidence
```

### 5.3 VERIFY (stage 3, no model)

`verifyCandidate()` — three mechanical checks:

1. **Path was sampled.** Exact match, or a *unique* suffix match. Ambiguity is not
   resolved — guessing would defeat the gate.
2. **Snippet is substantial** (≥ 8 non-space chars) — `}` identifies nothing.
3. **Snippet occurs in the file.** Whitespace/case-insensitive; the hit nearest the
   claimed line wins, so a repeated line resolves to the one meant. No hit → dropped.

The kept snippet is sliced from the file and dedented. Candidates are then sorted by
confidence and deduped against each other *and* against every rule already accepted
or rejected.

### 5.4 Frequency (D9)

The model returns a `probe` — a short literal characterising the rule (e.g.
`AsyncStateModel<`). Code runs it: `container.codeIndex.grep(repo, probe)` →
`occurrences`. A pattern in 42 files is a convention; the same pattern in 1 file is
a coincidence. The card shows both the count and the model's confidence.

## 6. Client — `/repos/[repoId]/conventions`

Reached from **SKILLS LAB → Conventions**. Header carries two distinct buttons,
**Run Scan** and **Re-scan**, plus a scan summary line
(`13 proposed · 2 dropped (ungrounded) · 17 files · $0.001`). Triage filter chips
with counts. Each candidate card shows the rule, a category badge, the evidence
`file:line` deep-linked to GitHub, the snippet, a confidence bar with its
percentage, and the occurrence count; its buttons are **Accept · Reject · Edit**
(inline) · Delete. **Create skill** appears once at least one candidate is accepted
and opens a modal where the name (default `repo-conventions`), description, type,
enabled flag and the whole markdown body are editable before anything is saved.

## 7. Testing

| Lane | File | Covers |
|------|------|--------|
| server unit | `test/conventions-helpers.test.ts` | gutter rendering, budget cut-off, every gate outcome, line correction, ambiguous path, dedupe, skill body, bucketed sampling |
| server integration | `test/conventions.it.test.ts` | scan drops the invented candidate, re-scan preserves decisions, edit → draft → `POST /skills`, 422 on an unsampleable repo and on nothing-accepted |
| client unit | `helpers.test.ts`, `ConventionCard.test.tsx`, `page.test.tsx` | filtering/counting, card interactions, scan summary, modal gating |

## 8. Acceptance criteria (EARS)

- **AC-1** When a user opens **SKILLS LAB → Conventions** for a repo, the system shall list that repo's stored candidates.
- **AC-2** When a user triggers **Run Scan** or **Re-scan**, the system shall sample the repo without calling a model, make exactly one structured model call, and persist the surviving candidates.
- **AC-3** While a candidate's cited snippet cannot be found in its cited file, the system shall discard that candidate and count it in `dropped_ungrounded`.
- **AC-4** Where a candidate's line number is wrong but its snippet occurs in the file, the system shall correct the line number rather than discard the candidate.
- **AC-5** When a user accepts, rejects or edits a candidate, the system shall persist that decision such that it survives a page reload and a server restart.
- **AC-6** When a re-scan runs, the system shall replace only `pending` candidates and leave accepted and rejected ones untouched.
- **AC-7** When at least one candidate is accepted, the system shall offer **Create skill**.
- **AC-8** When a user opens the Create-skill modal, the system shall present an editable name (defaulting to `repo-conventions`), description, type, enabled flag and markdown body, and shall persist nothing until the user confirms.
- **AC-9** When the user confirms, the system shall create a skill of type `convention` with source `extracted`, visible on `/skills`, and bind it to the chosen agent without disturbing that agent's other skills.
- **AC-10** Where the repo has no clone path or yields no readable sample, the system shall return 422 before making any model call.
- **AC-11** The system shall resolve the extraction model from `FEATURE_MODELS.conventions` (Settings → Feature Models) rather than a hardcoded constant.

## 9. Measured on a live scan

`OlegDEma/dev-digest` via `deepseek/deepseek-v4-flash`, 22 files sampled, ~$0.002,
12 proposed / 1 dropped by the gate. The kept rules were real house rules a
generic reviewer would not know — "route handlers resolve tenancy with
`getContext(app.container, req)` before anything else", "repository classes take
`private db: Db` and are the only layer importing drizzle", "constants live in a
per-module `constants.ts`".

Two findings from that run are baked into the design:

1. **`probe_literal` is the field a model gets wrong.** The first live run filled
   it with the *category* name (`"structure"`), which then grepped as an ordinary
   English word and reported 31 files as though it were a measurement. The system
   prompt now spends a paragraph on that one field, and `isUsableProbe()` rejects
   a probe that is a category name or bare prose — a fabricated number is worse
   than no number, so an unusable probe leaves `occurrences` null.
2. **repo-intel returns nothing when the indexer is off**, which made the whole
   feature dead rather than degraded. `sample()` now falls back to a deterministic
   walk of the clone (still pure code, still no say for the model).

## 10. Roadmap — more findings, and better ones

The gate is deliberately strict, so quality work means **feeding it more real
signal**, not loosening it. Shipped in v1: layered sampling incl. tests (§5.1) and
ripgrep frequency (§5.4). Still open:

1. **Git history as evidence.** A rule someone has already asked for twice in review
   is the strongest possible candidate; DevDigest's own findings table is a second
   source of the same signal.
2. **Counter-example search.** Report violations too ("holds in 38 files, 3 break
   it") — it both grades the rule and hands the user a ready-made cleanup task.
3. **Frequency as *the* confidence signal**, replacing the model's self-report
   entirely once §5.4 has been calibrated on real repos.
4. **Two-step dialogue.** The mock adapter already anticipates a
   `ConventionFileSelection` call before `ConventionExtraction`: let the model rank
   12 files out of a code-built list of 100. It never browses; it only ranks.
5. **Learn from rejections.** Rejected rules are labelled negatives — feed their text
   into the next scan's prompt as "the maintainer has already dismissed these".
6. **Contradiction check** against skills already in the Skills Lab, before a new
   rule lands.
7. **Scan on a schedule / on merge**, diffing against the last scan, so conventions
   drift with the codebase instead of being a one-off.
8. **Close the loop through review outcomes.** A convention whose skill produces
   findings that keep getting dismissed is a bad rule; the eval dashboard already
   has the shape to measure that.
