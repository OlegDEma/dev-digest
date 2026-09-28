# Seeded skills + importable samples

The eight `*.md` files here are the **seeded** skills — the human-readable
originals of what `server/src/db/seed-skills.ts` inserts (mirrored verbatim;
edit the file here **and** the TS constant, as `docs/agent-prompts/` does for
prompts). Each has the frontmatter the importer reads (`name`, `description`,
`type`), so every one of them can also be dragged into **Skills → Add Skill →
Import from file** as-is.

| Skill | Type | Bound to |
|---|---|---|
| `uncovered-branches.md` | rubric | Test Quality Reviewer |
| `boundary-and-corner-cases.md` | rubric | Test Quality Reviewer |
| `mocking-discipline.md` | convention | Test Quality Reviewer |
| `breaking-change-detector.md` | rubric | API Contract Reviewer |
| `response-shape-compatibility.md` | convention | API Contract Reviewer |
| `contract-first-changes.md` | convention | API Contract Reviewer |
| `semver-discipline.md` | rubric | API Contract Reviewer |
| `deprecation-policy.md` | convention | API Contract Reviewer |

`samples/` holds two skills that are **not** seeded, for walking the import path
in the UI:

- `samples/flaky-test-patterns.md` — a plain markdown skill; import it and bind
  it to the Test Quality Reviewer.
- `samples/route-versioning/` — a skill folder in the Claude-Code layout
  (`SKILL.md` + `references/` + `scripts/`). Zip the folder and import the zip:
  the preview shows `SKILL.md` as the core, lists `references/notes.md` and
  `scripts/check.sh` as **ignored**, and flags the script as executable-looking.
  Nothing in the archive is run, extracted or written to disk.

  ```sh
  cd docs/skills/samples && zip -r route-versioning.zip route-versioning
  ```

## Writing a skill

- **Description = the interface.** Write it as a directive: what the agent must
  check and how it must report. The agent reads it as an instruction, and the
  card on `/skills` shows it as the summary.
- **Body = the detail**, in markdown. It is appended verbatim to the prompt of
  every agent that binds it, as a `### <name>` block under `## Skills / rules`,
  after the agent's own system prompt. Text and configuration only — a skill
  never runs code.
- Keep the severity vocabulary the engine uses (`CRITICAL` / `WARNING` /
  `SUGGESTION`) and cite `file:line`; see `docs/agent-prompts/README.md`.
