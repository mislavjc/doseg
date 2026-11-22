#!/usr/bin/env bash
# Run the Playwright suite (e2e/) inside the Playwright image CI uses. Screenshot
# baselines only match when fonts and rasterizer match, so every run, local or
# CI, renders in this one image. Arguments go to `playwright test`.
#
#   scripts/e2e.sh                      # everything
#   scripts/e2e.sh --update-snapshots   # rewrite changed baselines
#   scripts/e2e.sh visual -g statistika
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Already inside the image (CI): run directly.
if [[ -d /ms-playwright ]]; then
  exec bunx playwright test "$@"
fi

VERSION=$(node -p 'require("./node_modules/@playwright/test/package.json").version')
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
# node_modules lives in a named volume so the container gets Linux x64
# binaries (next's swc, sharp) whatever the host is.
exec docker run --rm --init --ipc=host --platform linux/amd64 \
  -v "$PWD":/work -w /work \
  -v doseg-e2e-node-modules:/work/node_modules \
  -e CI -e E2E_RECORD -e E2E_SKIP_BUILD -e E2E_ISOCHRONE_UPSTREAM -e E2E_OTP_UPSTREAM \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "$IMAGE" bash -c '
    set -e
    npm install -g --silent bun@1 >/dev/null
    bun install --frozen-lockfile --ignore-scripts >/dev/null
    status=0
    bunx playwright test "$@" || status=$?
    chown -R "$HOST_UID:$HOST_GID" .next e2e test-results playwright-report 2>/dev/null || true
    exit $status
  ' _ "$@"
