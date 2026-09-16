# client — insights

Durable findings about `client/` that aren't visible in the code — recorded by
the `engineering-insights` skill (append-only; correct a stale entry with a dated
note beneath it, don't edit it away). Cross-package findings live in the root
[`../INSIGHTS.md`](../INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## Decisions

- **2026-09-16** — Cost is rendered with **fixed decimals** (`formatCostUsd` =
  `$${n.toFixed(6)}`, `client/src/lib/format.ts`), not significant figures. A
  `toPrecision(3)` first cut read well for one value but made a *column* of
  sub-cent costs unreadable: `$0.0000246` and `$0.000252` (a 10× gap) show with a
  different number of decimals, so per-agent timeline costs look alike and don't
  visibly sum to the PR total — a user reported the total looked "wrong" when it
  was arithmetically correct. Fixed 6dp aligns the column (mono/`tnum` cells) and
  keeps micro-dollar costs visible without a fake `$0.00`. Trade-off: milli-dollar
  values carry trailing zeros (`$0.012000`); hand-summing rounded rows can drift
  <1µ$ from the rounded true total. Evidence: `src/lib/format.ts`,
  `src/lib/format.test.ts`; PR-list total `$0.000532` = Σ latest run per agent
  (`24.6+252+174+45+37 µ$`).

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-16** — There is no Popover / Tooltip / HoverCard primitive in
  `@devdigest/ui` (`vendor/ui/kit/index.ts` exports only Drawer/Modal/Tabs/
  Dropdown/form inputs). The findings hover card
  (`client/src/components/findings/FindingsHoverCard.tsx`) is net-new and is
  `position:fixed`, measured from the trigger via `getBoundingClientRect()`, on
  purpose: the PR-list table wrapper is `overflow:hidden`
  (`app/repos/[repoId]/pulls/styles.ts` `tableCard`), so a `position:absolute`
  card gets **clipped** there. It closes on scroll/resize (fixed coords go stale)
  and `stopPropagation`s clicks so a card inside a click-to-navigate PR row doesn't
  navigate the row. The severity chip is the existing `SeverityBadge` with
  `compact`+`count` (colored icon + count, icons/colors from `SEV` in
  `vendor/ui/primitives/tokens.ts`) — reuse it, don't rebuild. Evidence:
  `client/src/components/findings/FindingsHoverCard.tsx`,
  `client/src/app/repos/[repoId]/pulls/styles.ts:91` (`tableCard` overflow:hidden),
  `client/src/vendor/ui/primitives/Badge.tsx:52`.

- **2026-09-16** — Deep-linking to a specific finding (hover card → the "Review
  runs" accordion) spans several components and has two non-obvious gotchas. Flow:
  the PR-list card navigates to `?tab=findings&finding=<id>`; `page.tsx` reads it →
  `FindingsTab` turns it into a `{ findingId, nonce }` target (kept in STATE, not
  the URL) threaded to every `ReviewRunAccordion`; the one that contains it opens,
  scrolls to `[data-finding-id]` (~60ms after `open` flips, so the panel has
  rendered) and passes the target into `FindingsPanel`/`FindingCard` so that card
  expands and the others in that run collapse. **Gotcha 1:** `?finding=` must be
  consumed ONCE and stripped, or reopening the tab re-scrolls every time —
  `FindingsTab.onFindingConsumed` → `page.tsx` clears it. **Gotcha 2:** clear it
  with `router.replace(url, { scroll: false })`; Next's default scroll-to-top
  otherwise fires right after and fights the scroll-to-finding (symptom: lands at
  the top, not the finding). Evidence: `FindingsTab.tsx:86,96` (handleGoToFinding +
  onFindingConsumed), `page.tsx:161` (scroll:false), `ReviewRunAccordion.tsx:53` +
  `FindingCard.tsx:52` (targetFindingId).

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
