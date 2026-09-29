# Next.js (App Router) — architecture & organization (reference)

Distilled, actionable guidance with citations, for Next.js 13–16 **App Router**
(React 19 / RSC). Pages Router material is legacy. Statuses: **CURRENT** = apply;
**HISTORICAL** = context only.

## Contents
1. Project structure (`app/` vs product code)
2. Organizing routes without touching URLs
3. Feature-based structure on App Router
4. Server / Client component boundary
5. Data fetching & the Data Access Layer
6. Server Actions
7. File placement quick reference
8. Currency notes

---

## 1. Project structure — `app/` is for routing only

Keep route files (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`,
`route.ts`, `not-found.tsx`) **thin**: they compose UI from your product code
(`src/features/…`, `lib/`, `components/`). Never place business logic or reusable
components directly in route files. `components`/`lib` are generic placeholders
with no framework meaning.

- Canonical page (top-level folders, routing files, strategies) —
  https://nextjs.org/docs/app/getting-started/project-structure
  - Organizing strategies — https://nextjs.org/docs/app/getting-started/project-structure#organizing-your-project
  - Split by feature/route — https://nextjs.org/docs/app/getting-started/project-structure#split-project-files-by-feature-or-route
- Layouts & pages (thin route files importing `@/lib`, `@/ui`) —
  https://nextjs.org/docs/app/getting-started/layouts-and-pages
- `src/` folder (separate app code from root config; what must stay in root) —
  https://nextjs.org/docs/app/api-reference/file-conventions/src-folder
- Practitioner layouts (Next.js 15, 2025–2026): `components/` split into `ui/` +
  `features/`; `lib/` for actions/queries/schemas importing nothing from
  `components`/`app`; warns against a flat 200-file `components/`:
  https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji ·
  https://www.groovyweb.co/blog/nextjs-project-structure-full-stack ·
  https://www.buttercups.tech/blog/react/nextjs-folder-structure-guide-for-app-router-projects ·
  https://medium.com/better-dev-nextjs-react/inside-the-app-router-best-practices-for-next-js-file-and-directory-structure-2025-edition-ed6bc14a8da3 (⚠️ Medium 403 to bots; unverified)

## 2. Organizing routes without touching URLs

- **Colocation is safe** — only `page`/`route` files are routable, so other files
  can sit inside `app/`.
  https://nextjs.org/docs/app/getting-started/project-structure#colocation
- **Private folders `_folder`** opt a subtree out of routing (good for
  route-local components/hooks).
  https://nextjs.org/docs/app/getting-started/project-structure#private-folders
- **Route groups `(group)`** organize routes / share layouts without changing the
  URL. https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- Dynamic segments: `[slug]`, `[...slug]`, `[[...slug]]`.
  https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes

## 3. Feature-based structure on App Router

Feature folders (see `react-organization.md` §2) apply on top of routing. Keep
`app/` for routes; put the product architecture in `src/`.

- **Feature-Sliced Design + App Router** — official guide: "Use `app/` for
  routing only; use `src/` for the product architecture."
  https://feature-sliced.design/blog/nextjs-app-router-guide ·
  Naming-collision fix (rename FSD `app`/`pages` layers to `_app`/`_pages`) —
  https://feature-sliced.design/docs/guides/tech/with-nextjs
- **bulletproof-react** adapts to Next.js (same unidirectional flow) —
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Next.js-aware folder evolution — https://www.robinwieruch.de/react-folder-structure/

## 4. Server / Client component boundary

- **Server Components by default.** Add `"use client"` only at interactive
  leaves; a client file pulls its entire import graph into the client bundle, so
  keep the boundary **low** in the tree. Interleave by passing Server Components
  as `children`/props to Client Components.
  https://nextjs.org/docs/app/getting-started/server-and-client-components ·
  Interleaving — https://nextjs.org/docs/app/getting-started/server-and-client-components#interleaving-server-and-client-components
- Mental model: two module graphs; **code crosses via imports, data crosses via
  props (must be serializable)**; a Server Component can render inside a Client
  Component through `children`.
  https://nextjs.org/docs/app/guides/server-and-client-boundary
- React-level primitives:
  https://react.dev/reference/rsc/server-components ·
  https://react.dev/reference/rsc/use-client ·
  https://react.dev/reference/rsc/use-server ·
  https://react.dev/reference/rsc/server-functions
- **Enforce boundaries** with `import 'server-only'` / `client-only` so
  server-only modules (DB, secrets, business logic) can't leak into a client
  bundle. https://www.npmjs.com/package/server-only (⚠️ npm 403 to bots;
  canonical, linked from Next.js docs) · https://www.npmjs.com/package/client-only
- Mental-model essays: Dan Abramov —
  https://overreacted.io/react-for-two-computers/ · Saewitz —
  https://saewitz.com/the-mental-model-of-server-components
- **HISTORICAL** standalone composition-patterns page (folded into the two docs
  above): https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns

## 5. Data fetching & the Data Access Layer

- **Fetch where data is used**, in Server Components (`async`/`await`). Identical
  `fetch`es are request-memoized; wrap ORM/DB calls in `React.cache` to dedupe;
  parallelize with `Promise.all`; stream with `<Suspense>`/`loading.js`.
  https://nextjs.org/docs/app/getting-started/fetching-data ·
  React.cache — https://nextjs.org/docs/app/getting-started/fetching-data#reusing-data-with-reactcache
- **Data Access Layer (DAL)** for anything sensitive: a `server-only` module that
  centralizes auth checks and returns **minimal DTOs**. Put authorization close
  to the data; **layouts and "return null" are NOT security boundaries** (partial
  rendering). Re-verify inside Server Actions and Route Handlers.
  https://nextjs.org/docs/app/guides/data-security ·
  DAL section — https://nextjs.org/docs/app/guides/data-security#data-access-layer ·
  Auth (verifySession, DTOs, where checks go) —
  https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal ·
  Foundational essay (Markbåge) —
  https://nextjs.org/blog/security-nextjs-server-components-actions
- Layered logic placement (API → Service → DAL) — Robin Wieruch:
  https://www.robinwieruch.de/next-authorization/

## 6. Server Actions

- A `"use server"` action is a **public POST endpoint**: authenticate, authorize
  the specific object (ownership, not just "logged in"), and validate inputs
  server-side (client checks are bypassable). Keep actions in their own files to
  avoid capturing sensitive closure data.
  https://nextjs.org/docs/app/guides/server-actions ·
  https://arcjet.com/learn/nextjs-server-action-security ·
  https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions
- Route Handlers live in `route.ts` (typically `app/api/.../route.ts`); a `route`
  and a `page` can't share a segment.
  https://nextjs.org/docs/app/api-reference/file-conventions/route

## 7. File placement quick reference

| File / concern            | Location                                                        |
| ------------------------- | -------------------------------------------------------------- |
| Route UI                  | `app/**/page.tsx`, `layout.tsx` (thin, compose from `src/`)     |
| Route-local component     | `app/**/_components/` (private folder) or the feature           |
| Reusable component        | `components/ui/` (primitive) or `components/` (shared)          |
| Feature code              | `src/features/<name>/{components,hooks,api,types,utils}`        |
| Data access (sensitive)   | `server-only` DAL in `lib/` (auth checks + DTOs)                |
| Server Action             | Own `"use server"` file (e.g. `features/<name>/actions.ts`)     |
| Route Handler (HTTP API)  | `app/api/**/route.ts`                                           |
| Edge/request rewrite      | `proxy.ts` at root or in `src/` (was `middleware.ts` pre-v16)   |
| App config / env          | Single typed, validated config module                          |

## 8. Currency notes

- **Next.js 16 renamed root `middleware.ts` → `proxy.ts`** (same placement;
  codemod `npx @next/codemod middleware-to-proxy .`). Guides that still say
  `middleware.ts` mean the same file.
  https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy
- The standalone "Composition Patterns" page is legacy — use the current
  Server/Client Components + boundary docs (§4).
