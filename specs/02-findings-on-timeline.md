# 02 — Findings on the PR timeline + PR-list Findings column

> Status: **implemented** (2026-09-16). Cross-module: `client/` + `server/` (a
> shared `PrMeta` contract change). EARS acceptance criteria are in §6. Mirrors the
> shape of [`01-run-cost-badge.md`](01-run-cost-badge.md).

## 1. Summary

Surface what the reviewer agents **found** on the two screens where it is
currently invisible:

- **PR detail → "Agent runs" timeline** (`RunHistory`): each settled run shows a
  colored **severity breakdown** (CRITICAL / WARNING / SUGGESTION, icon + count)
  in place of today's grey `"N findings"` text, and a **hover card** listing that
  run's findings (title, category, `file:line`, confidence, rationale snippet).
- **PR list** (`/repos/:id/pulls`): a new **FINDINGS** column with the same
  severity breakdown per PR + the same hover card.

Confirmed with product: both screens are in scope; the timeline shows chips **and**
a hover popover.

### Out of scope

- **No new backend endpoint** — the list's hover card reuses the existing
  `GET /pulls/:id/reviews` (`usePrReviews`); the timeline reuses findings already
  loaded on the detail page (`page.tsx:70-77`).
- **No DB migration / no new column** — the list breakdown is computed on read
  from existing `reviews`/`findings` tables (like `score`/`cost_usd` today,
  `pulls/routes.ts:114-159`).
- **No score-semantics change**, no change to the "Review runs" accordion or the
  trace drawer, and the hover card is **read-only** (no accept/dismiss).
- Touch/mobile hover is a known v1 limitation (no `:hover`); tap-to-open can follow.

## 2. Background — current state

| Layer | State today | Evidence |
|---|---|---|
| Finding shape | `severity ∈ CRITICAL/WARNING/SUGGESTION`, `category ∈ bug/security/perf/style/test`, `title/file/start_line/end_line/rationale/suggestion/confidence/kind`; no `run_id` on the finding. | `vendor/shared/contracts/findings.ts`, `review-api.ts` (`FindingRecord` adds `review_id`) |
| Run → findings | Transitive only: `findings.review_id → reviews.run_id → agent_runs.id`. `reviews.run_id` is nullable, no FK; one run can have 2 review rows (`kind` = `summary`\|`review`). | `db/schema/reviews.ts:19`, `run.repo.ts:74` |
| Timeline data | Detail page already loads `usePrReviews` (`ReviewRecord[]`, each with `run_id` + `findings[]`) **and** `usePrRuns` (`RunSummary[]`, counts only). Join pattern already used for the drawer: `runs.find(r => r.run_id === id)?.findings`. | `pulls/[number]/page.tsx:70-77,178` |
| Timeline render | `RunHistory` takes only `RunSummary[]`; shows `findings_count`/`blockers` as text (`RunHistory.tsx:192-197`). `FindingsTab` holds `runs` (`ReviewRecord[]`) but does not forward it. | `RunHistory.tsx`, `FindingsTab.tsx:131-137` |
| PR list | **No** findings column/data. Route computes `score` (latest review per PR) + `cost_usd` (sum of latest run per agent). A comment there says findings were intentionally omitted. | `pulls/routes.ts:114-159`, `PRRow.tsx`, `pulls/constants.ts` |
| Reusable UI | `SeverityBadge` (`compact`+`count` → colored icon + count) & `CategoryTag` (`vendor/ui/primitives/Badge.tsx:52-109`); severity icon/color/label from `SEV` (`tokens.ts:6-14`: CRITICAL→`AlertOctagon`, WARNING→`AlertTriangle`, SUGGESTION→`Lightbulb`). `ConfidenceNum`, `MonoLink`, `githubBlobUrl` (`lib/github-urls.ts`). **No** Tooltip/Popover primitive (closest: `Dropdown` styling tokens). | as cited |

## 3. Aggregation semantics (numbers must reconcile)

- **Timeline (per run):** the run's findings = union of findings of the review(s)
  whose `run_id === run.run_id`, **deduped by finding `id`**, **excluding
  dismissed** (`dismissed_at != null`). Chips and hover header both derive from
  this one set ⇒ header count == Σ chips.
- **List (per PR):** the PR's *current* findings = union of the **latest review
  per agent** (`kind = 'review'`, newest `created_at` per `agent_id`), excluding
  dismissed. Additive across agents (mirrors the `cost_usd` rule), so a
  multi-agent PR shows all agents' findings together. Score stays "single latest
  review" — unchanged.
- **`blockers`** on a timeline row keeps coming from `RunSummary.blockers` (the CI
  gate count) and shows as `"· N blockers"`, separate from the severity chips.

## 4. Contracts

| Contract | Change | File(s) |
|---|---|---|
| `PrMeta` | add `findings_by_severity: { CRITICAL, WARNING, SUGGESTION } \| null` (nullish — absent until reviewed) | `server/src/vendor/shared/contracts/platform.ts` **and** `client/src/vendor/shared/contracts/platform.ts` |

> ⚠️ **Drift:** the two `vendor/shared` trees are hand-copied and have no sync
> script — apply the identical edit to **both**. (`client/AGENTS.md`, root
> `INSIGHTS.md`.)

No change to `RunSummary`/`FindingRecord`: the timeline reads findings from
`ReviewRecord.findings` (already served).

## 5. Reusable building blocks (new, client)

- `client/src/lib/findings.ts` — pure helpers (unit-tested): `SEVERITY_ORDER`,
  `severityCounts(findings)`, `findingsByRun(reviews)` (timeline rule),
  `currentFindings(reviews)` (list rule).
- `client/src/components/findings/SeverityCounts.tsx` — chips row from a counts
  object (reuses `SeverityBadge compact count`, order CRITICAL→WARNING→SUGGESTION,
  hides zeros, optional `· N blockers`).
- `client/src/components/findings/FindingsHoverCard.tsx` — presentational hover
  popover (`{ findings, loading?, repoFullName?, headSha?, children }`); opens on
  hover/focus, closes on leave/blur/Escape; rows reuse `SeverityBadge`,
  `CategoryTag`, `MonoLink`+`githubBlobUrl`, `ConfidenceNum` + clamped rationale.
  Lives in the app tree (`vendor/ui` is do-not-touch); styled with existing tokens.

## 6. Acceptance criteria (EARS)

**Timeline (PR detail → Agent runs)**
- **AC-1** — When a settled run has ≥1 (non-dismissed) finding, the system shall
  render a severity chip per non-zero severity (icon + count), ordered
  CRITICAL → WARNING → SUGGESTION.
- **AC-2** — While a run has `blockers > 0`, the row shall append `"· N blockers"`
  after the chips, sourced from `RunSummary.blockers`.
- **AC-3** — When a run has no mapped findings (e.g. `run_id` null, or reviews not
  loaded), the system shall fall back to the existing `"N findings"` text.
- **AC-4** — When the user hovers/focuses a run's chips, the system shall show a
  card headed `"{n} findings"` (n == Σ chips) listing each finding's severity,
  title, category, `file:line`, confidence %, and a truncated rationale.
- **AC-5** — While `repoFullName` and `headSha` are known, each finding's
  `file:line` in the card shall deep-link to the GitHub blob at that line.

**PR list**
- **AC-6** — The list shall show a **FINDINGS** column (header from
  `list.columns.findings`) between SCORE and STATUS.
- **AC-7** — When `pr.findings_by_severity` is present, the cell shall render the
  severity chips (same component/rule as the timeline); when absent/null it shall
  render `"—"`.
- **AC-8** (*звірка цифр*) — The hover card total for a PR shall equal Σ of that
  row's chips, and both shall reconcile with the PR detail page's current findings
  (latest review per agent, excluding dismissed).

**Backend**
- **AC-9** — `GET /repos/:id/pulls` shall return `findings_by_severity` per PR
  computed as the union of the latest `review` per agent, counting non-dismissed
  findings by severity; a PR with no review shall return `null`.

## 7. Implementation plan (phased, file-by-file)

**Phase A — contract + shared helpers/components**
1. Add `findings_by_severity` to `PrMeta` in **both** `platform.ts` trees.
2. `client/src/lib/findings.ts` (+ `findings.test.ts`).
3. `client/src/components/findings/{SeverityCounts,FindingsHoverCard,index}.tsx`
   (+ `*.test.tsx`).

**Phase B — timeline**
4. `RunHistory.tsx`: new optional props `findingsByRun`, `repoFullName`,
   `headSha`; replace the text block (`:192-197`) with chips+hover, falling back to
   text (AC-1..AC-5). Update `RunHistory.test.tsx`.
5. `FindingsTab.tsx`: `useMemo(findingsByRun(runs))` and pass it + `repoFullName`
   + `headSha` into `<RunHistory>` (`:131`).

**Phase C — PR list (client + server)**
6. `server/src/modules/pulls/routes.ts`: add the findings aggregation beside
   score/cost; set `findings_by_severity`; drop the "not surfaced" comment (AC-9).
7. `PRRow.tsx`: new `<PrFindingsCell>` between Score and Status (chips from
   counts; lazy `usePrReviews` on hover → `currentFindings` → hover card).
   `pulls/constants.ts` (COLUMN_KEYS + GRID), `pulls/styles.ts` (findings cell).
   Update `PRRow.test.tsx`.
8. Copy: `messages/en/prReview.json` (`list.columns.findings`, timeline hover
   header/aria).

**Phase D — tests + insights**
9. Server DB-backed it-test: latest-review-per-agent breakdown, dismissed excluded,
   no-review → null.
10. `engineering-insights`: contract/rules → root `INSIGHTS.md`; hover-card UI →
    `client/INSIGHTS.md`.

## 8. Risks & gotchas

- **Contract drift** — edit `PrMeta` in both trees identically.
- **Number reconciliation (AC-8)** — timeline (per-run) and list (latest-per-agent)
  use different but documented rules; both dedupe by id and exclude dismissed so
  header == chips. The it-test locks the list rule.
- **Hover card is net-new** — no primitive; handle viewport-edge overflow, hover
  flicker (open delay), keyboard (focus/Escape). No `:hover` on touch (v1 limit).
- **`usePrReviews` needs a `QueryClientProvider`** — the `PRRow` test must wrap in
  one (query stays `enabled:false` until hover, so no fetch fires).
- `reviews.run_id` may be null (CI/summary) → those findings don't map to a run →
  AC-3 fallback.

## 9. Estimate

Small–medium, client-heavy. One shared contract field (both trees) + one read-side
server aggregation (no migration); the rest is client components/wiring/tests.
