# docs/research/ — research behind a spec

One file per spec, named after the spec with a **`.research.md`** suffix:
`docs/specs/2026-10-10-foo.md` (or `<pkg>/specs/2026-10-10-foo.md`) →
`docs/research/2026-10-10-foo.research.md`.

The suffix exists so the file is never mistaken for the spec itself. Files
written before 2026-10-11 used exactly the spec's file name (e.g.
`2026-10-11-project-context.md`) and keep it; `implementation-planner` looks
for both names.

Each file holds the `researcher` / `investigator` reports that the `spec`
skill ran for that spec, **verbatim**, one `## R<n> — <agent>: <question>`
section per report. It may also hold a `## Design sources (text)` section: a
text description of the design images, written by the main session when a
large revision is handed to a fresh `spec-creator` (spec skill, step 6b). The
main session writes it (spec skill, step 5); nobody edits a report after the
fact.

Why it exists: those reports cost real tokens and carry `path:line` evidence.
`implementation-planner` reads this file first and trusts it as pasted
research, instead of re-tracing the same flows. Without it the research lives
only in the spec chat and is paid for twice.

Not a spec and not a plan: no acceptance criteria and no decisions live here —
only evidence. If a report turns out to be wrong, the planner says so in its
plan (§10), and the file stays as it was.
