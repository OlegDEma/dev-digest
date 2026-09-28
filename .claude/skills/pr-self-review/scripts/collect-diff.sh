#!/usr/bin/env bash
# collect-diff.sh — print the pre-PR review set: files changed on this branch vs
# the base branch, PLUS the working tree (staged, unstaged, untracked), minus the
# never-review paths. One path per line on stdout; empty output = nothing to review.
#
# Usage: collect-diff.sh [base]        base defaults to main / origin/main (or $BASE)
# Excludes: node_modules, lockfiles, server/clones, db/migrations (generated),
#           and vendor/** EXCEPT vendor/shared/** (a deliberate contract change).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

base="${1:-${BASE:-}}"
if [ -z "$base" ]; then
  if   git show-ref --verify --quiet refs/heads/main;          then base="main"
  elif git show-ref --verify --quiet refs/remotes/origin/main; then base="origin/main"
  else base="HEAD"; fi
fi

{
  # 1. committed on this branch since it diverged from base
  if [ "$base" != "HEAD" ]; then
    mb="$(git merge-base HEAD "$base" 2>/dev/null || echo HEAD)"
    git diff --name-only "$mb" HEAD 2>/dev/null || true
  fi
  # 2. working tree: staged + unstaged + untracked (strip status cols and rename arrows)
  git status --porcelain=v1 --untracked-files=all | sed -e 's/^...//' -e 's/.* -> //'
} \
  | sort -u \
  | grep -vE '(^|/)node_modules/|(^|/)\.git/|(^|/)pnpm-lock\.yaml$|(^|/)package-lock\.json$|^server/clones/|(^|/)db/migrations/' \
  | awk '!( ( $0 ~ /(^|\/)vendor\// ) && ( $0 !~ /(^|\/)vendor\/shared\// ) )'
