#!/usr/bin/env bash
# ledger.sh — deterministic counter for "curation due" (see specs/06-helper-subagents.md D15).
#
#   ledger.sh record <module> <recorded|none>   one line per wrap-up of engineering-insights
#   ledger.sh status                            tasks since the last `curated` marker; due at THRESHOLD
#   ledger.sh curated                           marker: a human acted on the insight-curator's proposals
#
# The ledger is append-only and tracked, with `merge=union` in .gitattributes so parallel
# branches can both append. Union merge may land lines in random order, so `status` does not
# trust line order alone: it counts `task` lines dated AFTER the latest `curated` date, plus
# same-day `task` lines that sit below the last `curated` line of that date. A merge can
# still misplace same-day lines; the count may be off by a few near a marker, which is fine
# for a "~10 tasks" trigger.
#
# INSIGHTS_LEDGER overrides the file path (used by verification so it never touches the real one).
set -euo pipefail

THRESHOLD=10

LEDGER="${INSIGHTS_LEDGER:-$(git rev-parse --show-toplevel)/.claude/insight-curator/ledger.tsv}"
HEADER=$'# date\tkind\tmodule\trecorded — append via scripts/ledger.sh only'

ensure_file() {
  if [ ! -f "$LEDGER" ]; then
    mkdir -p "$(dirname "$LEDGER")"
    printf '%s\n' "$HEADER" > "$LEDGER"
  fi
}

cmd="${1:-}"
case "$cmd" in
  record)
    module="${2:-}"
    flag="${3:-}"
    case "$module" in
      root|server|client|reviewer-core|e2e) ;;
      *) echo "ledger.sh: module must be one of root|server|client|reviewer-core|e2e" >&2; exit 2 ;;
    esac
    case "$flag" in
      recorded|none) ;;
      *) echo "ledger.sh: flag must be recorded|none" >&2; exit 2 ;;
    esac
    ensure_file
    printf '%s\ttask\t%s\t%s\n' "$(date +%F)" "$module" "$flag" >> "$LEDGER"
    ;;
  curated)
    ensure_file
    printf '%s\tcurated\t-\t-\n' "$(date +%F)" >> "$LEDGER"
    ;;
  status)
    ensure_file
    read -r since n < <(awk -F'\t' '
      /^#/ || NF < 2 { next }
      $2 == "curated" { if ($1 >= since) { since = $1; last = NR } }
      $2 == "task"    { tasks[NR] = $1 }
      END {
        for (i in tasks) if (tasks[i] > since || (tasks[i] == since && i + 0 > last + 0)) n++
        printf "%s %d\n", (since == "" ? "never" : since), n
      }' "$LEDGER")
    if [ "$n" -ge "$THRESHOLD" ]; then
      verdict="curation due: invoke insight-curator"
    else
      verdict="not due"
    fi
    echo "ledger: $n tasks since $since (threshold $THRESHOLD) — $verdict"
    ;;
  *)
    echo "usage: ledger.sh record <module> <recorded|none> | status | curated" >&2
    exit 2
    ;;
esac
