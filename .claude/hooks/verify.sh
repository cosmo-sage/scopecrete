#!/usr/bin/env bash
# Claude Code Stop hook — an agent may not say "done" while the code it
# changed fails the repo's own checks. Runs the same checks as CI
# (.github/workflows/ci.yml) except the build: typecheck, lint on the changed
# files, and the tests.
#
# "Changed" = uncommitted and untracked files plus commits not yet pushed
# (or not yet on master when the branch has no upstream). A turn that changed
# no code costs nothing.
#
# Exit 2 sends the failures back to the agent and makes it keep working.
# If the agent is already continuing because of this hook (stop_hook_active)
# the hook reports but does not block again, so a failure it cannot fix
# cannot trap it in a loop — it has to say what is failing instead.

set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

input=$(cat)
active=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(!!JSON.parse(s).stop_hook_active))}catch{process.stdout.write("false")}})')

base=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo origin/master)
changed=$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; git diff --name-only "$base"...HEAD 2>/dev/null; } | sort -u)

code=$(printf '%s\n' "$changed" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$|^package(-lock)?\.json$|^eslint\.config\.' || true)
[ -z "$code" ] && exit 0

fail=""
# Regenerate Next's route types first: a stale .next/ (a page deleted since the
# last build) would otherwise fail the typecheck on files nobody changed.
npx next typegen >/dev/null 2>&1 || true
out=$(npx tsc --noEmit -p . 2>&1) || fail+=$'\n## Typecheck (npx tsc --noEmit)\n'"$(printf '%s' "$out" | head -40)"

lintable=$(printf '%s\n' "$code" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' | while read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done)
if [ -n "$lintable" ]; then
  # shellcheck disable=SC2086
  out=$(npx eslint --no-warn-ignored $lintable 2>&1) || fail+=$'\n## Lint (eslint on changed files)\n'"$(printf '%s' "$out" | head -60)"
fi

out=$(npm test --silent 2>&1) || fail+=$'\n## Tests (npm test)\n'"$(printf '%s' "$out" | grep -E 'not ok|Error|expected|actual|# (pass|fail)' | head -40)"

[ -z "$fail" ] && exit 0

if [ "$active" = "true" ]; then
  printf 'Checks still failing after a retry — say exactly what fails and why before stopping:%s\n' "$fail" >&2
  exit 0
fi
printf 'Not done: the code you changed fails the repo checks. Fix these before stopping (or say why they cannot be fixed here):%s\n' "$fail" >&2
exit 2
