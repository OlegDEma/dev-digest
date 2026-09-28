---
name: frontend-ui-architecture
description: >-
  Architecture and code-organization conventions for React and Next.js (App
  Router) frontends — where files, components, hooks, state, business logic,
  data-access, constants, and utilities should live, and how to draw module and
  Server/Client boundaries. Use this whenever structuring or refactoring a
  React/Next.js frontend: deciding folder structure, feature-based vs type-based
  layout, colocation, barrel files, where a component/hook/util/constant/type
  belongs, how to split an oversized component, where to put "use client",
  where data fetching and business logic go, or how to lay out a Data Access
  Layer and Server Actions. Reach for it even when the user only says "where
  should this go", "how do I organize this", "restructure the folders", or
  "clean up the architecture" without naming a skill. This skill is about
  STRUCTURE and ORGANIZATION only — for component-internal patterns, hooks
  correctness and performance defer to react-best-practices; for framework
  feature usage defer to next-best-practices; for tests defer to
  react-testing-library. Includes the concrete DevDigest `client/` layout (where
  pages, page components, shared components, hooks and tests live, plus the
  `_components/<PascalName>/` + `styles.ts` + `index.ts` naming convention).
version: 1.0.0
---

# Frontend UI Architecture

Decide **where code lives and how it is split** in a React or Next.js (App
Router) frontend. This skill is a set of decision guides, not a lecture — the
goal is a structure that a new engineer (or an agent) can navigate by intuition,
and that survives refactors because related things sit together.

## Scope and boundaries

Use this skill for: folder/file structure, module boundaries, where a given
piece of code belongs, how to break a component apart, and where the
Server/Client and data-access lines go.

Defer, and say so, when the real question is elsewhere:
- Component-internal patterns, hook rules, memoization, re-render perf →
  `react-best-practices`.
- A specific Next.js API/feature's usage (metadata, caching semantics, image) →
  `next-best-practices`.
- Writing or fixing tests → `react-testing-library`.

Organization and those topics overlap; when they do, apply this skill's
structural rule and hand off the internal detail.

## This repo: the DevDigest `client/` layout

The generic guidance above is the reasoning; **this section is the answer** for
`client/`. Where the two disagree, this section wins — the codebase already made
these choices and consistency beats a nicer template.

### Where things live

| Thing | Location | Notes |
|---|---|---|
| A page (route) | `client/src/app/<segment>/page.tsx` | **Thin.** It renders one component and nothing else. Dynamic segments are `[id]` / `[repoId]`. |
| Components for ONE page | `client/src/app/<route>/_components/<PascalName>/` | `_components` is a private folder — App Router does not route it. Nesting recurses: `_components/X/_components/Y/`. |
| Components shared across pages | `client/src/components/<area>/` | e.g. `components/app-shell/`, `components/diff-viewer/`, `components/findings/`. |
| Design-system primitives | `client/src/vendor/ui/` → `@devdigest/ui` | **Vendored — do not edit** (see `client/AGENTS.md` "Do not touch"). Add app-level components instead. |
| Data fetching | `client/src/lib/hooks/<domain>.ts` → `client/src/lib/api.ts` | TanStack Query only. **Never `fetch` inside a component.** Barrelled in `lib/hooks/index.ts`. |
| Shared contracts (types) | `client/src/vendor/shared/` → `@devdigest/shared` | Hand-copied twin of the server's canonical copy; edit both identically. |
| User-facing copy | `client/messages/en/<namespace>.json` | next-intl. A new namespace needs no registration — the loader globs the folder. **No hardcoded strings.** |

### The component folder

Every component folder follows the same shape:

```
_components/ConventionCard/
  ConventionCard.tsx        # "use client" + the component
  ConventionCard.test.tsx   # colocated test, same name
  styles.ts                 # co-located styles, exported as `s`
  constants.ts              # literals (optional)
  helpers.ts                # pure functions, unit-testable (optional)
  index.ts                  # `export { X, X as default } from "./X";`
```

Naming: the folder, the file and the exported component share one PascalCase
name. Files open with a `/* Name — one-line purpose */` comment.

### Styling

Inline `React.CSSProperties` objects in `styles.ts`, exported as a single const
named `s`. Static entries use `satisfies CSSProperties`; variant entries are
**functions**: `card: (status: Status): CSSProperties => ({ … })`. All colour and
spacing comes from CSS custom properties (`var(--accent)`, `var(--bg-surface)`,
`var(--border)`, `var(--text-secondary)`, `var(--ok)`, `var(--warn)`,
`var(--crit)`), never literals — that is what makes light/dark work. Tailwind is
installed but is **not** used in components; the only classNames are the global
`mono` and `tnum` helpers.

### Imports

Inside `src/app/**`, imports are **relative** (`../../../../lib/hooks/skills`),
even when deep. The `@/` alias exists in tsconfig but app code does not use it.

### Tests

Colocated as `<Name>.test.tsx` beside the component (pure logic as
`helpers.test.ts`). Mock the **hooks module**, never `fetch`. Wrap in
`NextIntlClientProvider` with the **real** `messages/en/<ns>.json` so assertions
read against real user-facing copy. See `react-testing-library` for the rest.


## First principles

These four ideas generate almost every concrete rule below. Prefer teaching the
principle over quoting the rule.

1. **Colocation.** Put code as close as possible to where it is used. A
   component's test, styles, sub-components, and one-off helpers live next to it,
   not in distant mirror folders. Distance between related files is a tax paid on
   every change.
2. **Feature-first, not type-first.** Beyond a trivial app, group by business
   domain (`features/checkout/…`) rather than by technical kind
   (`components/`, `hooks/`, `utils/` holding everything). A `hooks/` folder with
   forty unrelated hooks tells no one — including an AI editing the repo — where
   a new hook belongs. Keep type-based folders only for genuinely shared,
   domain-agnostic primitives.
3. **Promote on the second use (AHA).** A component/hook/util/constant starts
   *inside* the feature that needs it. It moves up to a shared location only once
   a second feature genuinely needs it. Prefer a little duplication over the
   wrong abstraction; wait for the pattern to reveal itself.
4. **Unidirectional dependencies.** Draw an import arrow and never let it point
   backwards: `shared → features → app/routes`. Shared code must not import from
   features; features should not import each other (go through shared, or lift
   the shared piece up). Enforce it with ESLint (`import/no-restricted-paths`)
   so the boundary is real, not aspirational.

## Where things go — quick decision table

| You have…                                   | Put it…                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| A component used by one feature             | Inside that feature: `features/<name>/components/`                       |
| A component used by ≥2 features             | Shared `components/` (or `components/ui/` for design-system primitives)  |
| A hook wrapping one feature's logic         | `features/<name>/hooks/` (or colocated with its component)              |
| Stateful/business logic reused across UI    | A **custom hook** — this is the modern home for logic (not containers)   |
| Pure, framework-agnostic helper             | `features/<name>/utils/`, promoted to a **named** shared module in `lib/`|
| A constant/enum for one feature             | `features/<name>/constants.ts` (or next to its consumer)                |
| App-wide constants/config                   | `config/` (single typed, validated source — see references)             |
| API/request code                            | A dedicated **API/service layer** (`features/<name>/api/` or `lib/api/`) |
| Server-state (fetched data)                 | A query hook over your data lib (React Query / RSC) — not local state    |
| A type/schema for one feature               | `features/<name>/types.ts`; shared contracts in a shared `types/`        |

## Splitting components

Split for a **reason to change**, not to hit a line count. Practical triggers:

- **The "and" test.** If you describe the component with "…and…" ("shows the
  profile *and* fetches the orders *and* formats the invoice"), each "and" is a
  candidate to extract.
- **Mixed concerns.** Pull data-fetching and business logic into a custom hook
  (`useOrders`) so the component is mostly presentational and props-driven; a
  thin parent can orchestrate.
- **Composition over configuration.** When a component grows a dozen boolean/
  config props, prefer composition: pass JSX via `children`/slots, or expose a
  compound API (`Dialog`, `Dialog.Header`). This also kills most prop-drilling —
  extract components and pass JSX down before reaching for Context.
- **Keep components pure.** Same props → same output; side effects belong in
  event handlers or effects. Purity is what makes a component safe to extract.

Historical note to *not* follow dogmatically: the strict
container/presentational split is superseded — encapsulate logic in custom hooks
instead of a wrapper "container" component.

## State organization

- **Separate two kinds of state.** *Server cache* (data you fetched — owned by
  the server, hard to cache correctly) belongs in a data-fetching library or RSC,
  not hand-rolled in `useState`. *UI state* (`isOpen`, selected tab) is local
  React state. Don't copy fetched data into local state.
- **Colocate state, then lift only when shared.** Start with state in the
  narrowest component that needs it; lift to a common parent only when two need
  it; reach for Context/global only when prop-drilling actually hurts.
- **Shape state well.** Group related fields, avoid contradictory booleans (use
  one status enum), derive don't duplicate, store IDs not nested copies, and
  normalize deeply-nested data.

## Constants, utils, config

- **Constants** in their own file(s), `UPPER_SNAKE_CASE`; split large sets by
  category (`constants/api.ts`, `constants/ui.ts`) rather than one dumping file.
- **Avoid a generic `utils`/`helpers` junk drawer.** A folder named for nothing
  collects everything. Prefer purpose-named modules under `lib/` (`lib/datetime`,
  `lib/currency`) with a clear scope and their own tests. "utils" is a smell once
  it passes a handful of unrelated functions.
- **Config/env in one typed place.** Read env vars once in a single config
  module, coerce to real types with defaults, and validate at startup (e.g. with
  Zod) so a bad config fails immediately — never scatter `process.env` reads.

## Barrel files (`index.ts`) — the one real tradeoff

Barrels that re-export a whole folder can defeat tree-shaking and slow builds
(one import pulls the whole barrel's graph). Resolution:
- A **single public-API `index.ts` per feature** is good — it defines the
  feature's surface and is what the boundary lint checks against.
- Avoid deep/broad barrels purely for prettier import paths; prefer **direct
  imports** in performance-sensitive and Next.js code.
- For third-party barrels you can't change, use Next.js `optimizePackageImports`.

## Atomic Design

Use the vocabulary (atoms/molecules/organisms) for shared UI primitives if the
team likes it, but don't make it folder law for the whole app — feature-based
colocation scales better for product code. Keep atomic naming for the shared
design-system layer only.

## Next.js (App Router) specifics

If the project uses the Next.js App Router, the routing folder and the product
architecture are two different things. Read
[`references/nextjs-app-router.md`](references/nextjs-app-router.md) for the full
guidance; the essentials:

- **`app/` is for routing only.** Keep `page.tsx`/`layout.tsx`/`route.ts` thin —
  they compose from `src/` (features/lib/components). Never park business logic
  or reusable components in route files.
- **Organize inside `app/` without touching URLs:** private folders `_folder`
  opt out of routing (safe colocation); route groups `(group)` group routes
  without changing the path. Colocation is safe — only `page`/`route` are
  routable.
- **Server Components by default.** Add `"use client"` only at interactive
  leaves; everything a client file imports enters the client bundle, so keep the
  boundary low. Pass Server Components into Client Components via `children`/props
  to interleave without pulling server code client-side.
- **Data fetching lives in Server Components / a Data Access Layer.** Fetch where
  the data is used (requests are memoized; wrap ORM/DB calls in `React.cache`);
  don't prop-drill data you can refetch. For anything sensitive, put a
  `server-only` **Data Access Layer** that runs auth checks and returns minimal
  DTOs — layouts are **not** a security boundary.
- **Server Actions are public POST endpoints.** Every `"use server"` action must
  authenticate, authorize the specific object, and validate inputs server-side;
  keep actions in their own files.
- **Currency note:** in Next.js 16 the root `middleware.ts` convention was
  renamed to `proxy.ts` (same placement, next to `app/`). Older guides naming
  `middleware.ts` mean the same file.

Feature-based structure still applies on top of App Router; Feature-Sliced Design
has an official adaptation (see the references).

## References

- [`references/react-organization.md`](references/react-organization.md) —
  React folder structure, component splitting, logic/hooks, state, constants,
  utils, barrels, with citations.
- [`references/nextjs-app-router.md`](references/nextjs-app-router.md) —
  App Router structure, RSC/Server-Client boundaries, data fetching, Data Access
  Layer, Server Actions, with citations.
- [`README.md`](README.md) — skill focus, coverage, use cases, relation to other
  skills, version, and the **complete list of research sources** (all links).

Apply the smallest structural change that resolves the question; cite the
principle behind it so the user understands the "why", and adapt to the
conventions already present in the target repo rather than imposing a template.
