# reviewer-core (`@devdigest/reviewer-core`) — agent map

## Before touching this module

Read this module's curated docs first — they are the source of truth; this file
only points at them:

- `specs/` — what we intend to build → before implementing a feature here
- `docs/` — how it works today → before changing behavior
- `INSIGHTS.md` — what we already tried & rejected → before debugging or refactoring
- [`README.md`](README.md) — pipeline diagram + public API → for the overview

Order: `specs/` → `docs/` → `INSIGHTS.md` → `README.md` → source. Cite them
instead of re-deriving from code. Cross-package findings live in the root
[`../INSIGHTS.md`](../INSIGHTS.md).

## Commands (⚠️ npm, not pnpm)

```sh
npm test          # vitest — hermetic, stubbed LLMProvider, no keys or network
npm run typecheck # tsc --noEmit — doubles as the build (the package emits no JS)
```

## Conventions (module-local, non-default)

- **Pure engine:** no DB, GitHub, or filesystem. The only side effect is one LLM
  call through an **injected** `LLMProvider` — that is what makes it mock-testable.
- Consumed by the server as **TypeScript source** via a tsconfig path alias
  (`@devdigest/reviewer-core` → `../reviewer-core/src`); it **never emits JS**, so
  `build` is a type-check.
- **Grounding is mandatory:** every finding must cite a real diff line or it is
  dropped (`groundFindings`, `grounding.ts`); the score is recomputed from the
  survivors (`review/reduce.ts`) — the model's self-reported score is ignored.
- **The output shape is enforced out of band**, not in the prompt: `json_schema`
  `strict` mode (`llm/openrouter.ts`) built from the Zod `Review` contract. Never
  describe JSON fields or a markdown layout in a system prompt.
- Untrusted content is fenced with `wrapUntrusted()` + a fixed `INJECTION_GUARD`
  appended to every agent prompt (`prompt.ts`).

## Gotchas

- Running `pnpm install` here creates a competing lockfile — this package uses
  `package-lock.json`. Match the lockfile already in the directory.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are fed by later
  course lessons; in the starter they're omitted and their sections are left out.

## Read when

- Read [`README.md`](README.md) when touching prompt assembly, structured output,
  or the grounding gate.
- Read [`../docs/agent-prompts/`](../docs/agent-prompts/) when changing what a
  reviewer flags or its severity/verdict rules.
