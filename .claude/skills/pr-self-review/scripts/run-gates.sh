#!/usr/bin/env bash
# run-gates.sh — Tier-1 deterministic gate. Runs the repo's own checks for the
# packages that actually changed, calling binaries directly to avoid the pnpm
# supply-chain gate (ERR_PNPM_IGNORED_BUILDS on pnpm typecheck|install|db:migrate).
# Prints one ✓/✗ line per check; exits non-zero if any check fails.
#
# Env:  SKIP_BUILD=1   skip the (slow) `next build`
#       BASE=<ref>     override the base branch for change detection
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
root="$(pwd)"
here="$root/.claude/skills/pr-self-review/scripts"

changed="$(bash "$here/collect-diff.sh" 2>/dev/null || true)"

affected() { printf '%s\n' "$changed" | grep -q "$1"; }
pkgs=()
affected '^client/'        && pkgs+=(client)
affected '^server/'        && pkgs+=(server)
affected '^reviewer-core/' && pkgs+=(reviewer-core)
affected '^e2e/'           && pkgs+=(e2e)

if [ ${#pkgs[@]} -eq 0 ]; then
  echo "Tier-1: no code packages changed — nothing to check."
  exit 0
fi

log="$(mktemp)"; trap 'rm -f "$log"' EXIT
fail=0
run() { # label  dir  command...
  local label="$1" dir="$2"; shift 2
  printf '  %-30s ' "$label"
  if ( cd "$root/$dir" && "$@" ) >"$log" 2>&1; then
    echo "✓"
  else
    echo "✗"; fail=1
    sed 's/^/      /' "$log" | tail -n 25
  fi
}

echo "Tier-1 deterministic gate — packages:${pkgs[*]/#/ }"

for p in "${pkgs[@]}"; do
  case "$p" in
    client)
      run "client · tsc --noEmit"   client ./node_modules/.bin/tsc --noEmit
      run "client · vitest run"     client ./node_modules/.bin/vitest run
      if [ "${SKIP_BUILD:-0}" = "1" ]; then
        printf '  %-30s %s\n' "client · next build" "skipped (SKIP_BUILD=1)"
      else
        run "client · next build"   client ./node_modules/.bin/next build
      fi
      ;;
    server)
      run "server · tsc --noEmit"   server ./node_modules/.bin/tsc --noEmit -p tsconfig.json
      run "server · vitest (hermetic)" server ./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'
      # arch:check is conditional — only if wired (see references/deterministic-checks.md)
      if grep -q '"arch:check"' server/package.json 2>/dev/null; then
        run "server · arch:check"   server pnpm run arch:check
      elif ls server/.dependency-cruiser.* >/dev/null 2>&1; then
        cfg="$(ls server/.dependency-cruiser.* | head -1)"
        run "server · depcruise"    server ./node_modules/.bin/depcruise --config "$root/$cfg" --validate src
      else
        printf '  %-30s %s\n' "server · arch:check" "not wired (reviewer-checked only)"
      fi
      ;;
    reviewer-core)
      run "reviewer-core · typecheck" reviewer-core npm run --silent typecheck
      run "reviewer-core · test"      reviewer-core npm test --silent
      ;;
    e2e)
      run "e2e · tsc --noEmit"      e2e npm run --silent typecheck
      ;;
  esac
done

echo
if [ "$fail" -ne 0 ]; then
  echo "Tier-1: ✗ FAILED — deterministic CRITICAL(s). Fix before opening the PR."
  exit 1
fi
echo "Tier-1: ✓ all checks passed."
