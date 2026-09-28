# React — code organization (reference)

Distilled, actionable guidance with citations. Read the linked source when you
need the full argument. Statuses: **CURRENT** = apply it; **HISTORICAL** =
context only, do not enforce.

## Contents
1. Folder & project structure
2. Reference architectures
3. Splitting & designing components
4. Component patterns
5. Component API & prop naming
6. Where business logic lives (custom hooks)
7. State organization
8. Data / service / API layer
9. Constants, utils/helpers, config
10. Error handling
11. Barrel files & imports
12. Style guides

---

## 1. Folder & project structure

- **Feature-first beyond trivial size.** Evolve single file → files → component
  folders → technical folders → **feature folders by domain**. Promote a
  hook/util/constant to shared only when a second feature needs it.
  Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/
- **React itself is unopinionated** about folders; the two classic axes are
  by-feature vs by-type. Avoid over-nesting.
  React FAQ (legacy, HISTORICAL page / CURRENT stance) —
  https://legacy.reactjs.org/docs/faq-structure.html
- **Feature folders survive refactors and AI edits**; type folders scatter
  context and erode boundaries.
  https://dev.to/avery_code/a-folder-per-type-or-a-folder-per-feature-only-one-of-them-survives-an-ai-session-c67
- Practitioner layouts (colocation, `helpers` vs `utils`, per-component folders,
  path aliases):
  Josh Comeau — https://www.joshwcomeau.com/react/file-structure/ ·
  Web Dev Simplified — https://blog.webdevsimplified.com/2022-07/react-folder-structure/

## 2. Reference architectures

- **bulletproof-react** — the canonical scalable layout. `src/` split into
  `app, assets, components, config, features, hooks, lib, stores, testing, types,
  utils`; per-feature subfolders; **unidirectional imports** (shared → features →
  app) enforced by ESLint; **absolute `@/*` imports**; kebab-case filenames;
  advises against broad barrels.
  Repo — https://github.com/alan2207/bulletproof-react ·
  Structure — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md ·
  Standards — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md
- **Feature-Sliced Design** — layers → slices → segments; imports only from
  layers strictly below; public API per slice.
  Home — https://feature-sliced.design/ ·
  Overview — https://feature-sliced.design/docs/get-started/overview ·
  Layers — https://feature-sliced.design/docs/reference/layers
- **Redux Style Guide** — feature-folder + single-file **slice** (`createSlice`,
  modern "ducks"); organize state by data domain, keep it normalized.
  https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic ·
  Ducks origin (HISTORICAL, still true in spirit) — https://github.com/erikras/ducks-modular-redux

## 3. Splitting & designing components

- **Decompose by single responsibility** (one reason to change); the "and" test.
  react.dev "Thinking in React" — https://react.dev/learn/thinking-in-react ·
  https://cekrem.github.io/posts/single-responsibility-principle-in-react/ ·
  https://sunscrapers.com/blog/single-responsibility-principle-in-react-applications-part-1/
- **Component basics that make extraction safe:** define at top level (never
  nest definitions), one default export per file, props as a read-only API.
  https://react.dev/learn/your-first-component ·
  https://react.dev/learn/importing-and-exporting-components ·
  https://react.dev/learn/passing-props-to-a-component
- **Keep components pure** — same inputs → same JSX; effects out of render.
  https://react.dev/learn/keeping-components-pure
- **Composition over inheritance / configuration** — `children` and slots.
  https://legacy.reactjs.org/docs/composition-vs-inheritance.html (stance CURRENT)

## 4. Component patterns

patterns.dev catalog (CURRENT; each notes when hooks supersede the older form):
- Compound — https://www.patterns.dev/react/compound-pattern/
- Provider (Context) — https://www.patterns.dev/vanilla/provider-pattern/
- HOC (now legacy vs hooks) — https://www.patterns.dev/react/hoc-pattern/
- Render props (still for headless libs) — https://www.patterns.dev/react/render-props-pattern/
- Hooks — https://www.patterns.dev/react/hooks-pattern/
- **Headless / compound** deep dive — https://www.martinfowler.com/articles/headless-component.html
- **Atomic Design** — vocabulary for shared primitives, not folder law for
  product code. https://bradfrost.com/blog/post/atomic-web-design/ ·
  https://atomicdesign.bradfrost.com/

## 5. Component API & prop naming

- Event props `on[Subject]Verb`; boolean props as bare adjectives defaulting to
  `false`; primitive values; namespace related components (`Dialog.Header`);
  mirror native DOM APIs when emulating inputs.
  https://imply.io/blog/an-opinionated-guide-to-component-apis/ ·
  https://medium.com/@shivamsainier98/best-practices-for-naming-props-and-states-in-react-db0d91a09feb (⚠️ Medium 403 to bots; content confirmed via search)

## 6. Where business logic lives (custom hooks)

- **Custom hooks are the modern home for reusable stateful/business logic** —
  they share logic, not state; `use`-prefix; keep them concrete.
  https://react.dev/learn/reusing-logic-with-custom-hooks
- **Keep logic out of Effects** where it doesn't belong (derive during render,
  handle events in handlers).
  https://react.dev/learn/you-might-not-need-an-effect ·
  https://react.dev/learn/separating-events-from-effects
- Extracting logic into hooks / pure functions for testability:
  https://felixgerschau.com/react-hooks-separation-of-concerns/ ·
  https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks ·
  Controller pattern — https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a (⚠️ Medium 403)
- **HISTORICAL — do not enforce:** container/presentational split; the author
  withdrew it (2019), replaced by hooks.
  https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 (⚠️ Medium 403)

## 7. State organization

- Split **server cache** vs **UI state**; don't hand-roll caching.
  https://kentcdodds.com/blog/application-state-management-with-react
- **Colocate state**, lift only when shared, Context only when prop-drilling
  hurts. https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster ·
  https://react.dev/learn/sharing-state-between-components ·
  https://react.dev/learn/passing-data-deeply-with-context
- **Shape state:** group, avoid contradictions, derive, store IDs, normalize.
  https://react.dev/learn/choosing-the-state-structure

## 8. Data / service / API layer

- A dedicated API layer: one client instance; each request = types + schema +
  fetcher + hook; colocate request declarations.
  https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md
- Server-state belongs in query hooks, not local state; React Query is an async
  state manager. TkDodo —
  https://tkdodo.eu/blog/practical-react-query ·
  https://tkdodo.eu/blog/react-query-as-a-state-manager

## 9. Constants, utils/helpers, config

- Constants: `UPPER_SNAKE_CASE`, split by category.
  https://dev.to/amirfakour/tips-to-use-constants-file-in-typescript-27je
- Replace generic `utils`/`helpers` with purpose-named `lib/*` modules.
  https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo
- One typed, validated config module instead of scattered `process.env`.
  https://echobind.com/post/ditch-process-env-use-a-typed-config

## 10. Error handling

- Error boundaries at meaningful UI levels (not every component); class API is
  still the native mechanism.
  https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
- `react-error-boundary` for reusable boundaries + `useErrorBoundary` for
  handler/async errors.
  https://github.com/bvaughn/react-error-boundary ·
  https://www.npmjs.com/package/react-error-boundary

## 11. Barrel files & imports

- Broad barrels defeat tree-shaking / slow builds; prefer direct imports, keep a
  single public-API index per feature, use `optimizePackageImports` for
  third-party barrels.
  https://vercel.com/blog/how-we-optimized-package-imports-in-next-js ·
  https://dev.to/adioof/barrel-files-are-the-clean-code-habit-quietly-wrecking-your-bundle-1cn6
- Foundational principles: colocation, AHA, prop drilling.
  https://kentcdodds.com/blog/colocation ·
  https://kentcdodds.com/blog/aha-programming ·
  https://kentcdodds.com/blog/prop-drilling

## 12. Style guides

- Airbnb React/JSX — naming, one-per-file, JSX conventions CURRENT; class
  lifecycle ordering HISTORICAL.
  https://github.com/airbnb/javascript/tree/master/react
