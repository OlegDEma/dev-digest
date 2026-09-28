# frontend-ui-architecture

**Version:** 1.0.0 · **Status:** stable · **Last updated:** 2026-09-21

A skill that helps decide **where frontend code lives and how it is split** in
React and Next.js (App Router) projects — the "UI architecture" of the codebase.

---

## Focus

Structure and organization, and nothing else. The skill answers questions like
*"where should this component / hook / util / constant / type go?"*, *"feature
folders or type folders?"*, *"how do I break this 600-line component apart?"*,
*"where does the business logic belong?"*, *"where do I draw the Server/Client
boundary?"*, and *"how should the data-access layer be organized?"*.

It is built to be picked up whenever someone is structuring or refactoring a
frontend — even when they don't name a skill and just say "clean up the
architecture" or "where does this go".

## What it covers

| Area | Examples |
| --- | --- |
| Folder / project structure | feature-based vs type-based, colocation, `src/`, monorepo-ish layouts |
| Module boundaries | unidirectional deps (`shared → features → app`), public-API `index`, ESLint boundaries |
| Component splitting | single-responsibility, the "and" test, composition over configuration |
| Business logic placement | custom hooks as the home for logic, service/API layer, controller-hook pattern |
| State organization | server-cache vs UI state, colocation, lifting, state shape/normalization |
| Constants / utils / config | constants files, purpose-named `lib/*` over a `utils` junk drawer, one typed config |
| Barrel files | when a public-API `index` helps vs when broad barrels hurt builds |
| Next.js App Router | thin route files, route groups, private folders, RSC boundaries, Data Access Layer, Server Actions |

## What it deliberately does NOT cover (and where to go instead)

This skill hands off to the existing, more specific skills so it stays focused
and avoids duplication:

| If the real question is… | Use |
| --- | --- |
| Component-internal patterns, hook rules, memoization, re-render performance, data-fetching correctness | **`react-best-practices`** |
| How to use a specific Next.js feature/API (metadata, caching semantics, image/font, route handlers behavior) | **`next-best-practices`** |
| Writing or fixing component/hook tests | **`react-testing-library`** |
| TypeScript type-level design | **`typescript-expert`** |
| Zod schema design | **`zod`** |

Rule of thumb: **`frontend-ui-architecture` decides *where* code goes and *how*
it is divided; the sibling skills decide *how the code inside is written*.** When
a task spans both, this skill sets the structure and defers the internals.

## When it triggers

Representative prompts:
- "Where should I put this `useCheckout` hook — in the feature or in a shared folder?"
- "My `Dashboard.tsx` is 800 lines. How do I split it?"
- "Should we go feature-based or keep `components/`, `hooks/`, `utils/`?"
- "Where does the business logic go in a Next.js App Router app?"
- "How do I structure the data-access layer and Server Actions securely?"
- "Restructure this frontend / clean up the folder architecture."

## Skill contents

```
frontend-ui-architecture/
├── SKILL.md                          # decision guides (model-facing)
├── README.md                         # this file (focus, coverage, links, version)
└── references/
    ├── react-organization.md         # React structure/components/logic/state/utils + citations
    └── nextjs-app-router.md          # App Router structure, RSC boundaries, DAL, Server Actions + citations
```

## Relation to the repo it ships in

Installed at `.claude/skills/` in the DevDigest repo, so it is versioned with the
project and available to anyone working here. The guidance is generic React /
Next.js, not DevDigest-specific — apply it *alongside* the repo's own
conventions (e.g. `client/`'s `_components/<PascalName>/` + `<Name>.test.tsx` +
`index.ts` feature-folder pattern), never overriding them.

## Versioning

The version lives in `SKILL.md` frontmatter (`version:`) and here. Bump it when
the guidance changes:
- **1.0.0** (2026-09-21) — initial release. React + Next.js App Router code
  organization; SKILL.md decision guides + two reference files; full research
  bibliography below.

Semantic intent: **major** = a stance changes (e.g. reversing a recommendation);
**minor** = new area/reference added; **patch** = wording, link fixes, currency
updates (e.g. a framework rename).

---

## Research sources (complete)

Every source used while building this skill, grouped by topic, each verified to
resolve unless marked ⚠️ (Medium/npm return HTTP 403 to automated fetchers — the
links are live and their content was confirmed via search). Status: **CURRENT**
= reflects current best practice · **HISTORICAL** = kept for context, not
recommended as-is.

### React — folder & project structure
- React FAQ "File Structure" (HISTORICAL page / CURRENT stance) — https://legacy.reactjs.org/docs/faq-structure.html
- Robin Wieruch — React Folder Structure [2026] — https://www.robinwieruch.de/react-folder-structure/
- Josh Comeau — Delightful React File/Directory Structure — https://www.joshwcomeau.com/react/file-structure/
- Web Dev Simplified — How To Structure React Projects — https://blog.webdevsimplified.com/2022-07/react-folder-structure/
- A Folder Per Type or Per Feature (AI-era take) — https://dev.to/avery_code/a-folder-per-type-or-a-folder-per-feature-only-one-of-them-survives-an-ai-session-c67

### React — reference architectures
- bulletproof-react (repo) — https://github.com/alan2207/bulletproof-react
- bulletproof-react — project-structure.md — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- bulletproof-react — project-standards.md — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md
- bulletproof-react — api-layer.md — https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md
- Feature-Sliced Design — home — https://feature-sliced.design/
- FSD — Overview — https://feature-sliced.design/docs/get-started/overview
- FSD — Layers reference — https://feature-sliced.design/docs/reference/layers
- Redux Style Guide — feature folders / single-file slice — https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic
- Ducks (original, HISTORICAL origin) — https://github.com/erikras/ducks-modular-redux

### React — splitting & designing components
- react.dev — Thinking in React — https://react.dev/learn/thinking-in-react
- react.dev — Your First Component — https://react.dev/learn/your-first-component
- react.dev — Importing and Exporting Components — https://react.dev/learn/importing-and-exporting-components
- react.dev — Passing Props to a Component — https://react.dev/learn/passing-props-to-a-component
- react.dev — Keeping Components Pure — https://react.dev/learn/keeping-components-pure
- react.dev — Choosing the State Structure — https://react.dev/learn/choosing-the-state-structure
- Composition vs Inheritance (legacy page, CURRENT stance) — https://legacy.reactjs.org/docs/composition-vs-inheritance.html
- SRP in React (cekrem, 2025) — https://cekrem.github.io/posts/single-responsibility-principle-in-react/
- SRP in React (Sunscrapers) — https://sunscrapers.com/blog/single-responsibility-principle-in-react-applications-part-1/

### React — component patterns
- patterns.dev — Compound — https://www.patterns.dev/react/compound-pattern/
- patterns.dev — Provider — https://www.patterns.dev/vanilla/provider-pattern/
- patterns.dev — HOC — https://www.patterns.dev/react/hoc-pattern/
- patterns.dev — Render Props — https://www.patterns.dev/react/render-props-pattern/
- patterns.dev — Hooks — https://www.patterns.dev/react/hooks-pattern/
- Martin Fowler — Headless Component — https://www.martinfowler.com/articles/headless-component.html
- Brad Frost — Atomic Design (post) — https://bradfrost.com/blog/post/atomic-web-design/
- Brad Frost — Atomic Design (book) — https://atomicdesign.bradfrost.com/

### React — component API & prop naming
- Imply — An Opinionated Guide to Component APIs — https://imply.io/blog/an-opinionated-guide-to-component-apis/
- Naming Props and States in React — https://medium.com/@shivamsainier98/best-practices-for-naming-props-and-states-in-react-db0d91a09feb ⚠️

### React — where business logic lives (custom hooks)
- react.dev — Reusing Logic with Custom Hooks — https://react.dev/learn/reusing-logic-with-custom-hooks
- react.dev — You Might Not Need an Effect — https://react.dev/learn/you-might-not-need-an-effect
- react.dev — Separating Events from Effects — https://react.dev/learn/separating-events-from-effects
- Felix Gerschau — Separation of concerns with hooks — https://felixgerschau.com/react-hooks-separation-of-concerns/
- eMoosavi — Decoupling Business Logic from UI with Custom Hooks — https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks
- The Controller Pattern — https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a ⚠️
- Presentational and Container Components (HISTORICAL, withdrawn 2019) — https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 ⚠️

### React — state management organization
- Kent C. Dodds — Application State Management with React — https://kentcdodds.com/blog/application-state-management-with-react
- Kent C. Dodds — State Colocation will make your app faster — https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
- react.dev — Sharing State Between Components — https://react.dev/learn/sharing-state-between-components
- react.dev — Passing Data Deeply with Context — https://react.dev/learn/passing-data-deeply-with-context

### React — data / service / API layer
- bulletproof-react — api-layer.md — https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md
- TkDodo — Practical React Query — https://tkdodo.eu/blog/practical-react-query
- TkDodo — React Query as a State Manager — https://tkdodo.eu/blog/react-query-as-a-state-manager

### React — constants, utils/helpers, config
- Tips to Use Constants File in TypeScript — https://dev.to/amirfakour/tips-to-use-constants-file-in-typescript-27je
- Why utils & helpers is a dump — https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo
- Echobind — Ditch process.env, use a typed config — https://echobind.com/post/ditch-process-env-use-a-typed-config

### React — error handling
- react.dev — Error boundary reference — https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
- react-error-boundary (repo) — https://github.com/bvaughn/react-error-boundary
- react-error-boundary (npm) — https://www.npmjs.com/package/react-error-boundary

### React — barrels, colocation principles, style guides
- Vercel — How we optimized package imports in Next.js — https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
- Barrel files are wrecking your bundle — https://dev.to/adioof/barrel-files-are-the-clean-code-habit-quietly-wrecking-your-bundle-1cn6
- Kent C. Dodds — Colocation — https://kentcdodds.com/blog/colocation
- Kent C. Dodds — AHA Programming — https://kentcdodds.com/blog/aha-programming
- Kent C. Dodds — Prop Drilling — https://kentcdodds.com/blog/prop-drilling
- Airbnb React/JSX Style Guide (partly dated) — https://github.com/airbnb/javascript/tree/master/react

### Next.js App Router — project & folder structure
- Next.js — Project structure and organization — https://nextjs.org/docs/app/getting-started/project-structure
  - Colocation — https://nextjs.org/docs/app/getting-started/project-structure#colocation
  - Private folders — https://nextjs.org/docs/app/getting-started/project-structure#private-folders
  - Route groups — https://nextjs.org/docs/app/getting-started/project-structure#route-groups
  - `src` folder — https://nextjs.org/docs/app/getting-started/project-structure#src-folder
  - Organizing strategies — https://nextjs.org/docs/app/getting-started/project-structure#organizing-your-project
  - Split by feature/route — https://nextjs.org/docs/app/getting-started/project-structure#split-project-files-by-feature-or-route
- Next.js — Layouts and Pages — https://nextjs.org/docs/app/getting-started/layouts-and-pages
- Next.js — Route Groups (convention) — https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- Next.js — Dynamic Routes (convention) — https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes
- Next.js — `src` Folder — https://nextjs.org/docs/app/api-reference/file-conventions/src-folder
- Next.js — Route Handlers (`route.js`) — https://nextjs.org/docs/app/api-reference/file-conventions/route
- Next.js — `proxy.js` (was `middleware.ts` pre-v16) — https://nextjs.org/docs/app/api-reference/file-conventions/proxy
  - Migration to proxy — https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy

### Next.js App Router — feature-based structure
- FSD — The Ultimate Next.js App Router Architecture — https://feature-sliced.design/blog/nextjs-app-router-guide
- FSD — Usage with Next.js — https://feature-sliced.design/docs/guides/tech/with-nextjs
- Best Practices for Organizing Next.js 15 (2025) — https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji
- Next.js Folder Structure: Best Practices 2026 (Groovy Web) — https://www.groovyweb.co/blog/nextjs-project-structure-full-stack
- Next.js Folder Structure Guide for App Router (Buttercups) — https://www.buttercups.tech/blog/react/nextjs-folder-structure-guide-for-app-router-projects
- Inside the App Router (2025 Edition) — https://medium.com/better-dev-nextjs-react/inside-the-app-router-best-practices-for-next-js-file-and-directory-structure-2025-edition-ed6bc14a8da3 ⚠️

### Next.js App Router — Server/Client boundary
- Next.js — Server and Client Components — https://nextjs.org/docs/app/getting-started/server-and-client-components
  - Interleaving — https://nextjs.org/docs/app/getting-started/server-and-client-components#interleaving-server-and-client-components
- Next.js — The Server and Client Boundary — https://nextjs.org/docs/app/guides/server-and-client-boundary
- Composition Patterns (v14, HISTORICAL) — https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- react.dev — Server Components — https://react.dev/reference/rsc/server-components
- react.dev — Server Functions — https://react.dev/reference/rsc/server-functions
- react.dev — `use client` — https://react.dev/reference/rsc/use-client
- react.dev — `use server` — https://react.dev/reference/rsc/use-server
- `server-only` (npm) — https://www.npmjs.com/package/server-only ⚠️
- `client-only` (npm) — https://www.npmjs.com/package/client-only
- Dan Abramov — React for Two Computers — https://overreacted.io/react-for-two-computers/
- Daniel Saewitz — The Mental Model of Server Components — https://saewitz.com/the-mental-model-of-server-components

### Next.js App Router — data fetching, DAL, Server Actions
- Next.js — Fetching Data — https://nextjs.org/docs/app/getting-started/fetching-data
  - Reusing data with React.cache — https://nextjs.org/docs/app/getting-started/fetching-data#reusing-data-with-reactcache
- Next.js — Server Actions and Mutations — https://nextjs.org/docs/app/guides/server-actions
- Next.js — How to think about data security (DAL/DTO) — https://nextjs.org/docs/app/guides/data-security
  - Data Access Layer — https://nextjs.org/docs/app/guides/data-security#data-access-layer
- Next.js — Authentication (DAL, DTO, where checks go) — https://nextjs.org/docs/app/guides/authentication
  - Creating a Data Access Layer — https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal
- Sebastian Markbåge — How to Think About Security in Next.js — https://nextjs.org/blog/security-nextjs-server-components-actions
- Robin Wieruch — Authorization in Next.js (API → Service → DAL) — https://www.robinwieruch.de/next-authorization/
- Arcjet — Are Next.js server actions a security risk? — https://arcjet.com/learn/nextjs-server-action-security
- Makerkit — Next.js Server Actions Security — https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions

---

## Key debates surfaced in research (the skill takes a stance on each)

1. **Barrel files** — a single public-API `index` per feature is good; broad
   barrels for prettier paths hurt tree-shaking/builds → prefer direct imports,
   use `optimizePackageImports` for third-party. (Comeau endorses per-component
   barrels; bulletproof-react / Vercel push back — the skill sides with the
   latter for perf-sensitive/Next.js code.)
2. **Container/Presentational** — HISTORICAL; use custom hooks for logic.
3. **Atomic Design as folder law** — vocabulary yes for shared primitives; not a
   whole-app folder mandate → feature-based wins for product code.
4. **Type-based vs feature-based** — feature-based with a public `index` boundary
   beyond trivial size.
