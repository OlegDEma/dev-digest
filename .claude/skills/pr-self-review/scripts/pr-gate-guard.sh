#!/usr/bin/env bash
# pr-gate-guard.sh — the PreToolUse hook body referenced by
# .claude/settings.json.hook-example. INERT until that hook is armed.
#
# Claude Code pipes the tool call as JSON on stdin. This fires only for a
# PR-opening command (`gh pr create` / `git push`) and blocks it (exit 2) when
# there is no fresh passing stamp — the honour-based local half of the gate.
set -uo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).tool_input?.command||""))}catch{process.stdout.write("")}})' 2>/dev/null || true)"

case "$cmd" in
  *"gh pr create"*|*"git push"*)
    root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
    if ! node "$root/.claude/skills/pr-self-review/scripts/pr-gate-check.mjs"; then
      echo "pr-self-review: no fresh passing review for this tree. Run /pr-self-review first, or push with an explicit override." >&2
      exit 2   # exit 2 tells Claude Code to block the tool and show this to the model
    fi
    ;;
esac
exit 0
