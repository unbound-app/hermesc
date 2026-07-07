#!/usr/bin/env bash
# Integration test for the hermesc auto-sync workflow's Linux path, driven by
# nektos/act with a mocked npm registry.
#
# CONSTRAINT: act runs Linux containers only. It cannot execute the Windows or
# macOS build jobs, so this test covers orchestration + decision wiring on the
# Linux path with a stubbed npm (no real registry, no real compilation).
# Cross-platform binary compilation is validated separately by a manual
# `workflow_dispatch` run, not here.
#
# What it asserts, by running only the preflight `check` job under act with a
# fake `npm` that returns a canned `versions --json`:
#   - skip-gate short-circuits (should_build=false) when <bytecode>.0.0 already exists
#   - new bytecode -> should_build=true and package_version=<bytecode>.0.0
#   - a `version` input overrides the derived version
# The publish/notify wiring (publish gated on `release`, dispatch fires on
# publish and its failure is non-fatal) is covered by the workflow's `if:`
# expressions plus the direct decision-script assertions in
# decide-version.test.js; act cannot reach a real publish without a registry.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v act >/dev/null 2>&1; then
  echo "SKIP: 'act' not installed (https://github.com/nektos/act). Linux-path integration test skipped."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "SKIP: docker daemon not available. act needs docker; Linux-path integration test skipped."
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Fake npm: `npm view` prints the canned payload in $NPM_VERSIONS_JSON. The
# decide step is the check job's only npm consumer (the job has no setup-node),
# so serving `view` is enough to keep it off the real registry.
cat >"$WORK/npm" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "${NPM_VERSIONS_JSON:-[]}"
STUB
chmod +x "$WORK/npm"

ACT_IMAGE="catthehacker/ubuntu:act-latest"

# The check job uses the image's default npm on PATH (no setup-node). Resolve
# that npm from the image itself and mount our stub over it — no toolcache-path
# guessing.
CONTAINER_NPM="$(docker run --rm --platform linux/amd64 "$ACT_IMAGE" \
  bash -lc 'command -v npm' | tr -d '\r')"
if [ -z "$CONTAINER_NPM" ]; then
  echo "SKIP: could not resolve the container's npm path; integration test skipped."
  exit 0
fi
echo "mocking container npm at: $CONTAINER_NPM"

run_check() {
  # $1 = canned npm versions JSON, $2... = extra act args
  local versions_json="$1"; shift
  act workflow_dispatch \
    -j check \
    -P "ubuntu-latest=$ACT_IMAGE" \
    --container-architecture linux/amd64 \
    --env "NPM_VERSIONS_JSON=$versions_json" \
    --container-options "-v $WORK/npm:$CONTAINER_NPM:ro" \
    "$@" 2>&1
}

pass=0
fail=0
check() { # $1 = description, $2 = haystack, $3 = needle
  if grep -qF "$3" <<<"$2"; then
    echo "  ok: $1"
    pass=$((pass + 1))
  else
    echo "  FAIL: $1 (expected to find: $3)"
    fail=$((fail + 1))
  fi
}

# Derived version = <upstream bytecode>.0.0. Read it straight from upstream so
# the test doesn't hardcode a bytecode number that upstream will eventually bump.
BYTECODE="$(curl -fsSL \
  https://raw.githubusercontent.com/facebook/hermes/main/include/hermes/BCGen/HBC/BytecodeVersion.h \
  | grep -oE 'BYTECODE_VERSION[[:space:]]*=[[:space:]]*[0-9]+' | grep -oE '[0-9]+$')"
if [ -z "$BYTECODE" ]; then
  echo "SKIP: could not read upstream bytecode version (offline?); integration test skipped."
  exit 0
fi
DERIVED="${BYTECODE}.0.0"
echo "upstream bytecode version: $BYTECODE -> derived $DERIVED"

echo "== case: derived version already published -> skip =="
out="$(run_check "[\"$DERIVED\"]" || true)"
check "should_build=false" "$out" "should_build=false"

echo "== case: new bytecode (unpublished) -> build $DERIVED =="
out="$(run_check '[]' || true)"
check "should_build=true" "$out" "should_build=true"
check "package_version=$DERIVED" "$out" "package_version=$DERIVED"

echo "== case: version input overrides derived version =="
out="$(run_check "[\"$DERIVED\"]" --input version=999.0.7 || true)"
check "package_version=999.0.7" "$out" "package_version=999.0.7"
check "should_build=true (override not yet published)" "$out" "should_build=true"

echo
echo "integration: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
