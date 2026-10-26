# run-plan

`/run-plan` runs the implementation half of spec-driven development from an
approved plan. The algorithm is in [SKILL.md](SKILL.md); this page is the
human-facing summary.

## Where it sits

```
manual:  /spec → spec-creator → you approve
manual:  implementation-planner (pass 1 → your answers → pass 2) → you approve the plan
/run-plan plan:docs/plans/<feature>.md
         implementer ×N → architecture-reviewer ‖ plan-verifier → fix cycle ≤ max-fix → report
manual:  pr-self-review → PR
```

## Usage

```
/run-plan plan:docs/plans/2026-10-11-foo.md
/run-plan plan:docs/plans/2026-10-11-foo.md design:https://figma.com/… mode:single max-fix:2
```

| Token | Default |
|---|---|
| `plan:<path>` | required |
| `spec:<path>` | the spec named in the plan header |
| `design:<path-or-url>` (repeatable) | none |
| `mode:multi\|single` | the plan's execution mode |
| `max-fix:<n>` | 3 |
| free text | passed to every implementer verbatim |

## Token decisions

- Main session orchestrates; only short reports enter its context.
- Implementers run `scripts/verify.sh` (targeted tests per phase, full suite once).
- Fix rounds re-review only the changed files and only the open findings, using
  the same reviewer/verifier agents (`SendMessage`), never fresh ones.
- Loop exits on clean, on no progress, or at `max-fix`.
- `test-writer` is disabled; `architecture-reviewer` and `plan-verifier` run on
  `sonnet`; the security pass is a `general-purpose` agent pinned to `sonnet`.
