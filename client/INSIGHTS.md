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
  `client/src/components/findings/`, `client/src/app/repos/[repoId]/pulls/styles.ts`
  (`tableCard` overflow:hidden), `client/src/vendor/ui/primitives/Badge.tsx:52`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
