#!/usr/bin/env bash
# Regenerate the committed pSEO page data (data/linije, data/stanice [+ optional
# district/network scores]) from the freshly-rebuilt OTP graph, validate it, and
# — if it materially changed — commit it to a branch and push, so the normal
# deploy bakes fresh pages. Runs ON THE SERVER (in /opt/doseg) right AFTER
# scripts/refresh-gtfs.sh has rebuilt OTP + isochrone on a valid feed.
#
# Why this exists: refresh-gtfs.sh fixes the LIVE map/isochrone, but the
# line/stop/kvart PAGES are SSG-baked from committed JSON — they stay stale
# until the JSON is regenerated and redeployed. This closes that gap.
#
# Determinism: the scorer asks the isochrone for schedule-only reach
# (`realtime=0`, handled in isochrone_server.rs) and we pin GENERATED_AT, so an
# UNCHANGED feed regenerates byte-identical output → empty diff → no commit, no
# deploy. The gate (regen-data-gate.py) is fail-closed: a degraded run (collapsed
# counts or walk-only reach) aborts before anything is committed.
#
# GitOps: we commit from the live /opt/doseg tree but immediately reset it back
# to origin/main (the regen rides safely on the pushed branch). The whole run
# holds a flock shared with deploy.yml so a deploy's `git reset --hard` can never
# wipe a mid-regen working tree.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK="${REGEN_LOCK:-/opt/doseg.lock}"
BRANCH="${REGEN_BRANCH:-update-gtfs-data}"
ISOCHRONE_HEALTH_URL="${ISOCHRONE_HEALTH_URL:-http://localhost:3001/health}"

exec 9>"$LOCK"
if ! flock -w 1800 9; then
  echo "regen: could not acquire $LOCK within 30m — another deploy/regen is running" >&2
  exit 1
fi

echo "==> Resetting working tree to origin/main (gitignored feed/graph survive)"
git fetch origin main
git reset --hard origin/main

echo "==> Checking isochrone is healthy and transit-backed (not walk-only fallback)"
HEALTH="$(docker compose exec -T isochrone curl -sf "$ISOCHRONE_HEALTH_URL" 2>/dev/null || true)"
echo "    $HEALTH"
if echo "$HEALTH" | grep -q '"fallback":true'; then
  echo "regen: isochrone is on the stale-feed fallback — refusing to regen from a degraded graph" >&2
  exit 1
fi

echo "==> Building the scorer image (cached)"
docker compose --profile tools build scorer

# Pin the timestamp so an unchanged feed yields byte-identical output. Day
# granularity: a regen for a given feed change is internally consistent; the gate
# reverts any residual timestamp-only diff.
export GENERATED_AT="$(date -u +%Y-%m-%dT00:00:00.000Z)"
scorer() { docker compose --profile tools run --rm -e "GENERATED_AT=$GENERATED_AT" scorer "$@"; }

echo "==> Regenerating line pages (data/linije)"
scorer --line-pages
echo "==> Regenerating stop pages (data/stanice)"
scorer --stop-pages

# Heavier district/network/route + per-day scores need OSM + walk-graph (present
# on the server). Off by default until the exact multi-day recipe is confirmed in
# a dry-run; enable with REGEN_DISTRICTS=1.
if [ "${REGEN_DISTRICTS:-0}" = "1" ]; then
  echo "==> Regenerating district/network/route stats + centrality"
  scorer --centrality
  for d in monday wednesday saturday; do
    echo "==> Regenerating district scores for $d"
    scorer --day "$d"
  done
fi

echo "==> Baking heroes (geometry-gated → near no-op unless a route/stop moved)"
# --ignore-scripts: the bun image has no Python/build toolchain, so a native
# postinstall (better-sqlite3 → node-gyp) would abort the install. The hero
# scripts only need JS + sharp's prebuilt binary (no build step), so skipping
# lifecycle scripts is safe and avoids the gyp failure.
docker run --rm -v "$PWD:/app" -w /app oven/bun:latest \
  sh -c "bun install --frozen-lockfile --ignore-scripts && bun scripts/build-line-heroes.ts && bun scripts/build-stop-heroes.ts && bun scripts/build-kvart-heroes.ts"

# Record the feed checksum the runner computed (audit trail), if it was passed in.
if [ -n "${CHECKSUMS:-}" ]; then
  printf '%s\n' "$CHECKSUMS" > data/gtfs/checksums.sha256
fi

echo "==> Validation gate (fail-closed)"
python3 scripts/regen-data-gate.py

echo "==> Staging regenerated artifacts"
git add -A \
  data/linije data/stanice data/kvart \
  public/linije public/stanice public/kvart \
  data/gtfs/checksums.sha256 \
  data/district-scores*.json data/route-stats.json data/network-stats.json \
  data/centrality-stats.json data/accessibility-profile.json 2>/dev/null || true

if git diff --cached --quiet; then
  echo "==> No material change — nothing to commit (feed schedule unchanged)."
  git reset --hard origin/main
  exit 0
fi

echo "==> Committing + pushing regen to '$BRANCH'"
git -c user.name="doseg-bot" -c user.email="bot@doseg.hr" \
  commit -m "data: regenerate pSEO pages from refreshed GTFS ($(date -u +%Y-%m-%d))"

if [ -n "${GH_TOKEN:-}" ]; then
  # owner/repo for the authenticated push URL. In CI it's GITHUB_REPOSITORY;
  # fall back to deriving it from origin (handles https or git@ remotes) for
  # manual server runs.
  slug="${GITHUB_REPOSITORY:-$(git remote get-url origin | sed -E 's#^git@github.com:#https://github.com/#; s#^https://[^/]*@#https://#; s#\.git$##; s#^https://github.com/##')}"
  git push --force "https://x-access-token:${GH_TOKEN}@github.com/${slug}.git" "HEAD:${BRANCH}"
else
  git push --force origin "HEAD:${BRANCH}"
fi

# Restore the live tree to the deployed state; the regen is safe on the branch.
git reset --hard origin/main
echo "==> Done. Open/merge the '$BRANCH' PR to deploy the refreshed pages."
