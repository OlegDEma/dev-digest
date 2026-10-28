# workflow-retro — references

## Where the data lives

| What | Path | Notes |
|---|---|---|
| Main session transcript | `~/.claude/projects/<slug>/<session-id>.jsonl` | `<slug>` = repo path with `/` and `.` → `-`. One JSON object per line. |
| Subagent transcript | `~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl` | Same format; `isSidechain: true`. A resumed agent appends to the same file. |
| Subagent metadata | `…/agent-<id>.meta.json` | `agentType`, `description`, `toolUseId`, `spawnDepth`. |
| Token usage | `message.usage` on `type: "assistant"` lines | `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`. Streamed blocks repeat the same `message.id` — count each id once (the script does). |
| Spawns / resumes | `tool_use` blocks named `Agent` / `SendMessage` in the main transcript | Order of spawns = launch order. |
| Tool errors | `tool_result` blocks with `is_error: true` | |

"Prompt-side tokens" = input + cache write + cache read. Cache reads are cheap
but not free; a low cache-read share means the context kept changing.

"Active time" = an agent's transcript split on idle gaps > 90 s
(`GAP_SECONDS` in the script). Idle time while the owner answers is excluded.

## Report template

```markdown
# Retro: <workflow> — <artifact path>

Date: YYYY-MM-DD · Session: `<id>` · Window: <since → end> · Workflow: <spec | implement | workflow script | ad-hoc>

## Summary
- Tokens: <total prompt-side> in / <output> out across <N> agents + main; biggest consumer: <agent> (<share>%).
- Cost: <$ from --prices, or "not computed"> · per useful output: <$ or tokens per spec / finding> · parallelism factor <x> · bottleneck <agent>.
- Outcome: <artifact, status, revisions>.
- Top problems: <1–2 lines>. Top recommendations: <1–2 lines>.

## Facts
<paste collect.py output verbatim>

## What went well
- <agent/round> — <what> (evidence: <fact row / quote>)

## What was hard
- <agent> — <difficulty> (evidence: <tool error / retries / quote>)

## Duplicated information
- <what was produced or read twice, by whom; tokens it cost if known>

## What was missed
- <gap> — caught by <owner / later round / nobody> (evidence)

## Owner load
- <rounds, questions asked, recommendations overridden and why>

## Recommendations
| # | Change | File | Expected effect | Evidence |
|---|---|---|---|---|
| 1 | <concrete edit> | `.claude/agents/<x>.md` | <fewer tokens / fewer rounds / catches X> | <finding> |
```

## INDEX.md header

```markdown
# Workflow retros

| Date | Workflow | Artifact | Agents | Resumes | Owner turns | Prompt-side tok | Output tok | Cache share | Parallelism | Cost | Wall clock | Revisions | Retro |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
```

One row per retro, appended at the bottom. Compare a row with earlier rows of the
same workflow type before writing recommendations — a trend beats a single run.

## Self-retro prompt

Send only when the owner asks for it; each send reloads that agent's context.

> Retro, answer in ≤150 words, no tool calls: (1) what in your instructions or
> inputs was missing or ambiguous; (2) what cost you the most turns; (3) what you
> re-derived that the orchestrator could have handed you; (4) one change to your
> agent definition that would have helped. Facts only, cite turns or files.
