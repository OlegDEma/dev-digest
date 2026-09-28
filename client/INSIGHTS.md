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

- **2026-09-21** — The kit `Checkbox` (`src/vendor/ui/kit/Checkbox.tsx`) is a `<button role="checkbox">` wrapped in a `<label>`, and Chromium does NOT name a role-overridden button from its wrapping label: in the browser's accessibility tree the control shows as a bare `checkbox` with no name — probed on 2026-09-21 with both a plain-text label and a `.sr-only` span, same result — while RTL's `getByRole("checkbox", { name })` still resolves it in jsdom (dom-accessibility-api walks the label) and so hides the gap in tests. When the name matters (a list of look-alike toggles, e2e locators), render your own `<button role="checkbox" aria-label=…>` — `SkillsTab`'s `BindCheckbox` is the copy to reuse. Evidence: `src/vendor/ui/kit/Checkbox.tsx:12-37`, `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:203`.

- **2026-09-21** — `SkillBodyEditor` gets syntax tint + a line gutter with no editor library by stacking a transparent-text `<textarea>` over a `<pre>` "highlight layer" with IDENTICAL metrics (`fontFamily/fontSize/lineHeight/letterSpacing/tabSize/padding` come from one shared `text` object in its `styles.ts`). Two rules make it stay aligned: lines never wrap (`white-space: pre`, `wrap="off"`, the body scrolls sideways — wrapping would desync the gutter from visual lines), and the textarea is `position:absolute; inset:0; overflow:hidden` inside a wrapper sized by the `<pre>`, so it never has internal scroll. Because the textarea's text is transparent its native placeholder is invisible too — the placeholder is drawn in the layer (`placeholderLayer`) when the value is empty. Evidence: `src/app/skills/_components/SkillEditor/_components/SkillBodyEditor/styles.ts:84`, `SkillBodyEditor.tsx` (`showPlaceholder`).

- **2026-09-21** — `/skills` and `/skills/[id]` share ONE shell, `SkillsWorkspace`, which owns the rail and the create/import modals and hands the right column to the page as a render prop `children({ openCreate, openImport })`. That is what lets the landing's empty-state CTA open the same modal the rail's *Add Skill* menu does without lifting modal state into every page — copy this shape rather than duplicating the rail + modal wiring in a new skills route. Evidence: `src/app/skills/_components/SkillsWorkspace/SkillsWorkspace.tsx:33`, `src/app/skills/_components/SkillsLanding/SkillsLanding.tsx`.
  - **2026-09-22** — The two modals merged into ONE tabbed `CreateSkillModal` (tabs **Create · From file · Import from URL**; panels + a shared `ImportPreview` colocated in its folder), and the rail's *Add Skill* is now a plain `Button` (the `Dropdown` menu is gone). The render prop is unchanged and still the shape to copy — `SkillsWorkspace` keeps one `addTab` state; `openCreate` opens the modal on the Create tab, `openImport` on the From file tab. `ImportSkillModal` was deleted and its file-read helpers moved to `CreateSkillModal/helpers.ts`. Evidence: `src/app/skills/_components/SkillsWorkspace/_components/CreateSkillModal/CreateSkillModal.tsx`, `SkillsWorkspace/SkillsWorkspace.tsx` (`addTab`), `SkillsRail/SkillsRail.tsx`.

- **2026-09-22** — The skill **Versions tab (Diff + Restore)** is client-only over two pre-existing endpoints — no new server route. `useSkillVersions` reads `GET /skills/:id/versions` (bodies, newest-first) for the list; the inline diff is a local LCS in `VersionsTab/diff.ts` that diffs each version against the one BEFORE it (oldest vs `""` → all-add). **Restore reuses `PUT /skills/:id { body }`** (`useUpdateSkill`), which is why that hook now also invalidates `["skill-versions", id]`. Two facts drive the UX: `skill_versions` snapshots the **body only** (no name/type), so Diff/Restore are body-scoped; and the update path re-snapshots on any content change, so restoring an old body creates a NEW current version (restore v1 while on v2 → v3, list grows). Spec `specs/03-skills.md` had listed restore under *Out of scope* — now implemented this way. Evidence: `src/app/skills/_components/SkillEditor/_components/VersionsTab/VersionsTab.tsx`, `src/lib/hooks/skills.ts` (`useSkillVersions`, `useUpdateSkill`), `../server/src/modules/skills/repository.ts:91-113`.

- **2026-09-23** — RTL's `getByRole(…, { name })` matches the **computed accessible name**, which is not `textContent`: a `Chip` renders its label and count as adjacent elements, so `textContent` is `"Accepted1"` but the accessible name is `"Accepted 1"` (a space is inserted between the two nodes). A regex like `/^Accepted\d/` therefore never matches, and a bare `/Accepted/` collides with the card's own `Accept`/`Accepted` buttons. Use the exact string for plain buttons (`{ name: "Reject" }`) and anchor chips on the space-separated count (`/^Accepted \d/`). To see the real names, `computeAccessibleName` from `dom-accessibility-api` (already a transitive dep) beats guessing. Evidence: `src/app/repos/[repoId]/conventions/page.test.tsx`, `src/vendor/ui/primitives/Chip.tsx`.

- **2026-09-23** — A container with `role="button"` + its own Enter/Space `onKeyDown` **breaks every interactive control nested inside it**: the keydown bubbles up, the container's `preventDefault()` cancels the nested button's activation, and the container's own `onClick` runs instead. On `SkillRailCard` this made the Delete button and the whole ConfirmDialog keyboard-dead — Enter merely selected the card. **jsdom cannot catch this** (it never synthesizes click-from-Enter), so the RTL suite stayed green; it was found by dispatching a real `KeyboardEvent` in a browser and reading `ev.defaultPrevented`. Guard the handler with `if (e.target !== e.currentTarget) return;` and render overlays as a sibling of the card, not a descendant. An `onClick` stopPropagation wrapper does **not** help — it stops clicks, not keydowns. Evidence: `SkillRailCard.tsx` (the guard + the fragment), `SkillRailCard.test.tsx` → "does not swallow keyboard activation of its nested controls".

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-21** — Running `next build` while `pnpm dev` is up corrupts the dev server's `.next/` (both write the same folder): every route then 500s with `Cannot find module './617.js'` (`E394`) and HMR drops. Fix: stop the dev server, `rm -rf client/.next`, start it again — there is nothing to repair in the code. Run the production build only with the dev server stopped (the `pr-self-review` skill's Tier-1 `next build` step included). Evidence: browser console after `./node_modules/.bin/next build` on 2026-09-21; `client/.next` recreated on restart.

## Open Questions
