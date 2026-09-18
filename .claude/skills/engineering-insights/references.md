# Engineering Insights — references & rationale

## What each section means

The heading set differs by file — **modules** carry *Decisions*, **root** carries
*Session Notes* — but the meanings are shared. Pick the one that fits; never
invent a new heading.

| Section | Holds | Scope |
|---|---|---|
| **Decisions** | A deliberate choice + why + the rejected alternative | modules |
| **What Works** | An approach/pattern that proved effective and isn't obvious | all |
| **What Doesn't Work** | A failed approach / dead end / antipattern, **with why** | all |
| **Codebase Patterns** | A project-specific convention/architecture/naming rule | all |
| **Tool & Library Notes** | A quirk/gotcha/useful behavior of a dependency | all |
| **Recurring Errors & Fixes** | An error seen more than once + its exact fix | all |
| **Session Notes** | A dated cross-package summary of a session's outcome | root |
| **Open Questions** | Something unresolved that needs investigation | all |

## Routing recap

One insight → one file. Package-internal findings go in that package; findings
about how packages interact, or a shared contract, go in root.

- `server/**` → `server/INSIGHTS.md`
- `client/**` → `client/INSIGHTS.md`
- `reviewer-core/**` → `reviewer-core/INSIGHTS.md`
- `e2e/**` → `e2e/INSIGHTS.md`
- ≥2 packages · `**/vendor/shared/**` · `scripts/**` · root config → root `INSIGHTS.md`

## Design rationale (why it's built this way)

- **INSIGHTS, not LEARNINGS.** This repo's files were already named `INSIGHTS.md`;
  the skill matches them. The mechanism is the one the sources call a "LEARNINGS.md
  / wrap-up" system.
- **Fixed sections, append-only, dated, Evidence-cited.** Structure keeps the file
  loadable as context and diffable in git; Evidence keeps it honest (an
  unverifiable claim isn't an insight).
- **The cold-read test** is the single quality gate — it's what separates a lesson
  ("`Promise.all()` times out past 30 items here — batch 10 with `allSettled()`")
  from noise ("promises can be tricky").
- **Correction-by-nesting, never edit.** In a team, editing another person's entry
  causes merge conflicts and silently erases a lesson; a nested dated correction
  preserves the history and surfaces the conflict.
- **Human-reviewed draft.** The wrap-up does ~90%; a periodic human pass prunes,
  consolidates, and resolves contradictions. Past ~200 entries, split by domain.

## Automation upgrade — the `Stop` hook (optional, L06)

Description-based triggering + the `CLAUDE.md` reminder + manual
`/engineering-insights` is the default here because auto-firing at session end is
unreliable on its own. The heavier, more reliable option is a Claude Code `Stop`
hook that runs a capture script when a session ends. **Not installed** — adding it
is standing configuration, so only wire it up when the user asks. Ready-to-paste
into `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "python3 .claude/capture_insights.py" }
        ]
      }
    ]
  }
}
```

The script reads the session JSON from stdin, extracts the turns and tool calls,
asks Claude to pull out only the insights that pass the cold-read test, routes each
to the right `INSIGHTS.md`, and appends. Keep the same quality gate as the manual
path, or the file fills with noise.

## Sources

Verified 2026-09-15. **✅** = primary source fetched and read; **⚠️** = not
independently verified (see the note at the end).

- ✅ **MindStudio — Self-Learning LEARNINGS.md System / Wrap-Up** —
  <https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up>.
  Source for: the seven sections, wrap-up timing (>30 min, skip trivial),
  good/bad entries, dedup, the ~200-entry limit + domain-splitting, append-only +
  git, human-reviewed draft. Caveat honestly noted: this article recommends
  *against* capture-as-you-go — *"use hooks or a slash command rather than
  capture-as-you-go, to batch learnings once per session"* — whereas this skill
  keeps the double trigger, siding with the course slides over the article.
- ✅ **MindStudio — Building a Compounding Knowledge Loop with Claude Code** —
  <https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code>.
  Source for: the `CLAUDE.md` + knowledge-file loop, the `Stop`-hook capture
  pattern, and the compounding-across-sessions effect.
- ✅ **Eugene Oleinik (evoleinik) — CLAUDE.md: Building Persistent Memory for AI
  Coding Agents** —
  <https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322>
  (mirror: <https://evoleinik.com/posts/claude-md-as-agent-memory/>). Verbatim:
  *"Prisma Accelerate has 5MB response limit - use select not include"*; and the
  payoff after three months — *"an agent that feels like a team member who's been
  on the project for months, not a contractor starting fresh every morning."* His
  curation is **stricter** than this skill's: one line per item, **hard cap 30**,
  reviewed monthly, filtered by *"Would this save 5+ minutes next time?"* — because
  he keeps everything inside a single `CLAUDE.md`. This repo follows MindStudio's
  per-file model (a separate `INSIGHTS.md` per module), so it uses the higher
  ~200-per-file soft cap rather than 30. His 5-minute test is now the **first
  gate** in `SKILL.md`'s quality bar (worth recording?), paired with the cold-read
  test (specific enough to act on?).
- ⚠️ **reddit.com/r/ClaudeAI** — cited on the course slide (the "~6 months in,
  10–15 min every session re-explaining architecture, then built memory" pain
  point). **Not independently verified:** `reddit.com` is not accessible to this
  agent's web tools (WebFetch / WebSearch return `400 domain not accessible`), so
  the original thread could not be opened. This line reflects the slide, not a
  source that was read.

**Verification note (2026-09-15).** An earlier draft of this file listed the
dev.to and reddit entries as if they had been read at the source, when only the
two MindStudio articles had actually been fetched. dev.to/evoleinik has since been
read and corrected above; reddit remains unverifiable with the available tools and
is marked as such.
