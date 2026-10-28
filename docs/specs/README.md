# docs/specs/ — feature specifications spanning several modules

This folder holds **specifications only** — the *what* and *why* — for features
that touch **two or more** modules: `server`, `client`, `reviewer-core`, `mcp`,
`e2e`. A single-module spec lives in that module's own `<pkg>/specs/`, e.g.
[`../../server/specs/`](../../server/specs/).

Next door is [`../plans/`](../plans/): implementation plans (the *how*) that
`implementation-planner` writes from an approved spec. A plan has exactly the
spec's file name: `docs/specs/2026-10-10-foo.md` → `docs/plans/2026-10-10-foo.md`.
The research the spec phase ran is saved under the same name in
[`../research/`](../research/), so the planner does not redo it.

Not to be confused with:
- the root [`../../specs/`](../../specs/) — legacy documents `01`–`12`, where spec
  and plan were one file. Read them; add nothing there;
- [`../../e2e/specs/`](../../e2e/specs/) — `*.flow.json` browser flows, not specs.

## Who writes

The [`spec-creator`](../../.claude/agents/spec-creator.md) agent. It works in
rounds:
1. It analyses the request and the designs, then returns **blocking questions
   only**, plus **research requests**. The main session runs those as parallel
   `researcher` / `investigator` subagents.
2. It writes a `draft`. Non-blocking questions go to Open questions, with the
   default the ACs were written against.
3. It applies the owner's edits.

It runs a 9-point self-check before every return, and it writes spec files
only.

## Format

- File name: `YYYY-MM-DD-slug.md` — the creation date plus a short kebab-case
  feature slug that tells features apart. If the slug is taken in any spec
  folder, pick a more specific one. `Spec ID` is the file name without `.md`.
  The name never changes after creation.
- Language: English.
- Sections: header (`Spec ID`, `Status`, `Supersedes`) · Problem & user ·
  Goals / Non-goals · User stories · Design & UX · Service communication ·
  Contracts · Acceptance criteria (EARS) · Edge cases · Non-functional
  requirements · Inputs and provenance · Untrusted inputs · Traceability
  (goal → US → AC → EC → NFR → contract → how to verify) · Open questions
  (`Q-n`, each with the default used).
  The full template is in the agent's prompt.
- A spec describes behaviour, not implementation. It **may** contain workflow
  diagrams, service-communication diagrams and boundary contracts (the shape of
  data crossing a module or API boundary). It **never** contains files to edit,
  function or component names to create, DB tables or migrations, libraries, or
  phase plans.

## Status

`draft` → `approved` → `implemented`. The agent sets `draft`, the owner sets
`approved`, and the planner/implementer flow sets `implemented`. An `approved`
spec is frozen: a change of decision is a new spec with `Supersedes:`.
