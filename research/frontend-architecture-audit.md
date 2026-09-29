# Frontend architecture audit — `client/` (`@devdigest/web`)

> Reviewed against the `frontend-ui-architecture`, `react-best-practices` and
> `next-best-practices` skills. Scope: **frontend only** (`client/`), excluding
> `src/vendor/**` (vendored, do-not-touch). Date: 2026-09-21.
> Evidence is cited as `file:line`.

## Verdict

The client is already **well-architected** — this is a tune-up, not a rebuild.
Feature colocation, a clean data layer, and a purpose-named `lib/` are all in
place. The improvements below are concrete anti-patterns and App-Router gaps, not
structural rewrites.

## What's already good (keep doing this)

- **Feature colocation** — route-local features in `app/**/_components/<Name>/`
  each with its own `*.test.tsx`; matches the skill's colocation + feature-first
  principles.
- **Clean data/service layer** — all fetching in `src/lib/hooks/*` over
  `src/lib/api.ts`; **zero** `fetch`/`axios` inside components (verified). Server
  state lives in TanStack Query, not `useState`.
- **`lib/` is not a junk drawer** — purpose-named modules (`format.ts`,
  `github-urls.ts`, `model-label.ts`, `feature-models.ts`, `findings.ts`) instead
  of a generic `utils.ts`.
- **Colocated `constants.ts` and `styles.ts`** per component; `@/*` path alias;
  vendored contracts isolated under `src/vendor/**`.
- **No hardcoded copy** — `next-intl` messages; costs-formatting decision is even
  documented in `client/INSIGHTS.md`.

---

## Priorities

### P1 — high value, clear fix

**1.1 — Stop mirroring props into `useState` + reset-effect; use the `key` prop.**
`ConfigTab` copies 9 props into local state and then resets all 9 in a
`useEffect` keyed on `agent.id` (`ConfigTab.tsx:18-39`). This is the exact
anti-pattern both skills call out (react-best-practices: *"never use useState +
useEffect to sync"*; react.dev *"You Might Not Need an Effect" → reset state with
a key*). Fix: render `<ConfigTab key={agent.id} agent={agent} />` from the parent
so React remounts on agent switch, and delete the reset effect. Consider
consolidating the 9 `useState`s into one `useReducer`/form-state object.
*Also audit the other prop-mirroring effects:* `AddRepoView.tsx:22`,
`FindingsPanel.tsx:39,47`. **Effort: S.**

**1.2 — Add App-Router error/loading/not-found boundaries.** There are **no**
`error.tsx`, `not-found.tsx`, `loading.tsx`, or `global-error.tsx` anywhere in
`src/app` (verified), and no React error boundary at all — a runtime error in any
client subtree white-screens the app. next-best-practices and the skill's
error-handling section both flag this. Fix: add a route-level `error.tsx` (+
`not-found.tsx`, and `loading.tsx` where a skeleton helps) at least at `app/` root
and around the PR-detail route; adopt `react-error-boundary` for client subtrees
with `resetKeys={[pathname]}` and a "Try again" action. **Effort: M.**

**1.3 — Cut client bundle with `optimizePackageImports` + lazy-load heavy libs.**
`next.config.mjs` has no bundle optimization, yet the app is almost entirely
client-rendered and pulls heavy libraries: `mermaid`, `recharts`,
`react-markdown`, `lucide-react`. Two fixes:
- `experimental.optimizePackageImports: ['lucide-react', 'recharts']` (barrel
  imports — Vercel's own headline example).
- Lazy-load the heavy, screen-specific renderers with `next/dynamic`
  (`MermaidDiagram`, recharts usage, markdown) so they're not in the initial
  bundle. **Effort: S–M.**

### P2 — medium

**2.1 — Replace the fragile scroll-coordination hack.**
`ReviewRunAccordion.tsx:51-79` flips `open`, then waits `setTimeout(…, 60)` for
the panel to render, then imperatively mutates DOM (`el.style.boxShadow = …`) and
nests another `setTimeout(…, 1200)`. Racing React's render with a 60ms guess is
brittle (already documented as a gotcha in `client/INSIGHTS.md`), and directly
mutating `el.style` bypasses React. Prefer a `ref` callback / `useLayoutEffect`
that runs after commit, and drive the highlight via a state flag + CSS class
instead of inline style writes. At minimum, extract `60`/`1200` into named
constants — other files already do this (`CLOSE_DELAY_MS` in
`FindingsHoverCard.tsx:162`, `G_NAV_TIMEOUT_MS` in `useGlobalShortcuts.ts:40`), so
the inline magic numbers are an inconsistency. **Effort: M.**

**2.2 — Standardize styling on the house `styles.ts` pattern.** The documented
convention is co-located `styles.ts` exporting typed `CSSProperties`
(`ConfigTab/styles.ts`), but there are **98 inline `style={{…}}` literals** across
`src` vs **22** `styles.ts` files. Inline object literals get a new identity every
render (breaks `React.memo`, react-best-practices HIGH) and split the styling
convention in two. Fix: move inline objects into the component's `styles.ts`.
Separately, **Tailwind v4 is installed but barely used** — decide to adopt it or
drop the dependency; right now it's dead weight. **Effort: M** (mechanical).

**2.3 — Use stable keys for data-bearing lists.** `key={i}`/`key={idx}` on real
data lists: `FileCard` in `DiffViewer.tsx:28`, `ToolCallRow` in `TraceBody.tsx:102`,
diff lines in `FileCard.tsx:83`, highlight lines in `PromptModalBody.tsx`. Index
keys corrupt state/DOM when lists reorder or filter (react-best-practices
CRITICAL). Use a stable id/path (file path, tool-call id). Pure skeleton lists
(`pulls/page.tsx:110`) are fine to leave. **Effort: S.**

### P3 — strategic / larger

**3.1 — Revisit the "everything is a Client Component" stance (decision, not a
bug).** 62 files carry `'use client'`; every `page.tsx` is a client component that
fetches client-side via TanStack Query. That's a deliberate, testable SPA-style
choice (fetch mocked in tests) and fine for a course starter — but on App Router +
React 19 it leaves the platform's wins unused: server-side initial data,
streaming with `loading.tsx`/Suspense, smaller client bundles, and a `server-only`
Data Access Layer. If/when performance or SEO matters, move read-only initial data
into Server Components and hydrate TanStack Query (`HydrationBoundary`) rather than
fetching everything on the client; the root redirect done in a client effect
(`app/page.tsx:15-19`) is a small first candidate for a server redirect. Keep as a
**conscious decision** with the tradeoffs written down. **Effort: L.**

**3.2 — Minor cleanups.**
- `lib/hooks/index.ts` re-exports via `export *` from 5 files. It's the data
  layer's public API (acceptable), but named re-exports (or direct
  `@/lib/hooks/<domain>` imports, which the barrel comment already invites) tree-
  shake better. **Effort: S.**
- `next.config.mjs` `env: { NEXT_PUBLIC_API_BASE }` is redundant — `NEXT_PUBLIC_*`
  vars are already inlined; the manual mapping bakes the localhost fallback at
  build time. Drop the `env` block and read the var directly in `lib/api.ts`.
  **Effort: S.**
- **A11y sweep** — confirm every icon-only button has `aria-label`, and announce
  SPA route changes for screen readers (react-best-practices HIGH). **Effort: M.**

---

## Suggested order

1. **P1.1** (key-prop fix) and **P1.3** (bundle) — smallest effort, clear wins.
2. **P1.2** (error/not-found boundaries) — real resilience gap.
3. **P2.3** (keys) then **P2.2** (styling consistency) — mechanical, low risk.
4. **P2.1** (scroll hack) — needs care; guard with the existing e2e flow.
5. **P3.1** (RSC) — schedule as its own spike with the tradeoffs written down.

Nothing here requires touching `src/vendor/**`. Each item cites the skill rule and
the file:line so it can be picked up independently.
