#!/usr/bin/env bash
#
# DevDigest verify — typecheck + tests with SHORT output, for agents and humans.
# Prints one PASS/FAIL line per check and, on failure, only the relevant tail;
# the full log is kept in a temp file whose path is printed.
#
#   ./scripts/verify.sh                    # targeted: packages + files from git changes
#   ./scripts/verify.sh server client      # targeted, but only these packages
#   ./scripts/verify.sh --full             # whole hermetic suite of every changed package
#   ./scripts/verify.sh --full server      # whole hermetic suite of server/
#   ./scripts/verify.sh --full --it server # + DB-backed *.it.test.ts (needs TEST_DATABASE_URL)
#
# Targeted = tsc + `vitest related <changed files>` (tests that import them).
# Full     = tsc + the package's whole suite. Gate B / CI-like runs use --full.
# Uses the direct binaries: `pnpm typecheck|test` abort on ERR_PNPM_IGNORED_BUILDS
# in server/ and client/. e2e/ gets a typecheck only; run `npm run e2e:hermetic`
# yourself (needs Docker). Exit status: 0 when every check passed.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FULL=0
IT=0
PKGS=""
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    --it)   IT=1 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    server|client|reviewer-core|mcp|e2e) PKGS="$PKGS $arg" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/devdigest-verify.XXXXXX")"

# Changed + untracked files, repo-relative, never from clones or worktrees.
changed_files() {
  { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } \
    | grep -vE '^(server/clones/|\.claude/worktrees/)' | sort -u
}
CHANGED="$(changed_files)"

if [ -z "$PKGS" ]; then
  for p in server client reviewer-core mcp e2e; do
    if printf '%s\n' "$CHANGED" | grep -q "^$p/"; then PKGS="$PKGS $p"; fi
  done
fi
if [ -z "$PKGS" ]; then
  echo "verify: no changed package (nothing under server/ client/ reviewer-core/ mcp/ e2e/)"
  exit 0
fi

FAILED=0

# run <label> <pkg> <cmd...> — runs in the package dir, prints a short result.
run() {
  local label="$1" pkg="$2"; shift 2
  local log="$LOGDIR/${pkg}-${label}.log"
  if (cd "$ROOT/$pkg" && "$@") >"$log" 2>&1; then
    local summary
    summary="$(grep -E '^\s*(Test Files|Tests)\s' "$log" | sed 's/^ *//' | tr '\n' ' ')"
    echo "PASS  $pkg  $label  ${summary}"
  else
    FAILED=1
    echo "FAIL  $pkg  $label  (full log: $log)"
    { grep -E 'error TS|FAIL|✗|×|AssertionError|Error:|expected|Test Files|Tests ' "$log" || tail -n 30 "$log"; } \
      | grep -v '^\s*$' | head -n 40 | sed 's/^/      /'
  fi
}

for pkg in $PKGS; do
  if [ ! -x "$ROOT/$pkg/node_modules/.bin/tsc" ]; then
    FAILED=1; echo "FAIL  $pkg  setup  node_modules missing — install with the package's own manager"; continue
  fi

  run tsc "$pkg" ./node_modules/.bin/tsc --noEmit

  [ "$pkg" = "e2e" ] && { echo "SKIP  e2e   tests  run 'cd e2e && npm run e2e:hermetic' (needs Docker)"; continue; }

  EXCL=()
  [ "$pkg" = "server" ] && EXCL=(--exclude '**/*.it.test.ts')

  if [ "$FULL" = 1 ]; then
    run tests "$pkg" ./node_modules/.bin/vitest run --passWithNoTests ${EXCL[@]+"${EXCL[@]}"}
    if [ "$pkg" = "server" ] && [ "$IT" = 1 ]; then
      if [ -z "${TEST_DATABASE_URL:-}" ]; then
        echo "SKIP  server  it-tests  TEST_DATABASE_URL is not set — not run, not green"
      else
        run it-tests server ./node_modules/.bin/vitest run .it.test --no-file-parallelism
      fi
    fi
  else
    FILES="$(printf '%s\n' "$CHANGED" | grep "^$pkg/" | sed "s#^$pkg/##" \
      | grep -E '\.(ts|tsx|js|jsx|mts|cts)$' | while read -r f; do [ -f "$pkg/$f" ] && echo "$f"; done)"
    if [ -z "$FILES" ]; then
      echo "SKIP  $pkg  tests  no changed source files (use --full for the whole suite)"
    else
      # shellcheck disable=SC2086
      run tests-related "$pkg" ./node_modules/.bin/vitest related --run --passWithNoTests ${EXCL[@]+"${EXCL[@]}"} $FILES
    fi
  fi
done

[ "$FAILED" = 0 ] && echo "verify: all checks passed" || echo "verify: FAILED"
exit "$FAILED"
