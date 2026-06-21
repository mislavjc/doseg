#!/usr/bin/env bash
# Rebuild the OTP graph and restart the isochrone server from the GTFS feed in
# data/gtfs/, with validation, health-gated startup, and rollback. Run this ON
# THE SERVER (in /opt/doseg) after a GTFS feed update, or with --download to
# pull the latest ZET feed first for an emergency out-of-band refresh.
#
# Why this exists: OTP only knows the static feed it loaded. When that feed's
# rolling window runs out, every isochrone silently degrades to a walk-only
# blob. The normal refresh path is the `update-data` workflow opening (and
# auto-merging) a PR, after which `deploy` force-recreates OTP. This script is
# the manual lever for the same thing.
#
# NOTE (GitOps): deploy.yml does `git reset --hard origin/main`, which reverts
# any `--download` swap that isn't committed to main. Use --download only to
# bridge an emergency, then merge the `update-gtfs-data` PR so the change sticks.
set -euo pipefail
cd "$(dirname "$0")/.."

DOWNLOAD=0
[ "${1:-}" = "--download" ] && DOWNLOAD=1

GTFS="data/gtfs/zet.zip"
BAK="${GTFS}.bak"
MIN_RUNWAY="${MIN_RUNWAY_DAYS:-14}"

# Validate a GTFS zip: prints its service window, exits 1 (broken) / 2 (expired).
validate() {
  python3 - "$1" "$MIN_RUNWAY" <<'PY'
import zipfile, csv, io, datetime, sys
path, min_runway = sys.argv[1], int(sys.argv[2])
z = zipfile.ZipFile(path)
def rows(n):
    with z.open(n) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))
DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
last = 0
try:
    for r in rows("calendar_dates.txt"):
        if (r.get("exception_type") or "").strip() == "1":
            last = max(last, int(r["date"]))
except KeyError:
    pass
try:
    for r in rows("calendar.txt"):
        if any((r.get(d) or "0").strip() == "1" for d in DAYS):
            last = max(last, int(r["end_date"]))
except KeyError:
    pass
trips = sum(1 for _ in rows("trips.txt"))
if last == 0 or trips == 0:
    print("invalid feed (no service window or zero trips)"); sys.exit(1)
ld = datetime.datetime.strptime(str(last), "%Y%m%d").date()
runway = (ld - datetime.date.today()).days
print(f"feed last service {ld}, runway {runway}d, {trips} trips")
if runway < 0:
    sys.exit(2)
if runway < min_runway:
    print(f"warning: only {runway} days of runway")
sys.exit(0)
PY
}

if [ "$DOWNLOAD" = "1" ]; then
  echo "==> Downloading latest ZET GTFS..."
  curl -fSL --retry 3 --retry-delay 5 -o "${GTFS}.new" "https://zet.hr/gtfs-scheduled/latest"
  echo "==> Validating new feed..."
  if ! validate "${GTFS}.new"; then
    echo "New feed failed validation — keeping current feed." >&2
    rm -f "${GTFS}.new"
    exit 1
  fi
  cp -f "$GTFS" "$BAK"
  mv -f "${GTFS}.new" "$GTFS"
fi

echo "==> Validating on-disk feed..."
validate "$GTFS" || { echo "On-disk feed invalid; aborting." >&2; exit 1; }

echo "==> Rebuilding OTP graph + restarting isochrone (waiting for health)..."
if docker compose up -d --force-recreate --wait --wait-timeout 600 otp isochrone; then
  echo "==> Healthy. Feed status:"
  docker compose exec -T isochrone curl -sf http://localhost:3001/health || true
  echo
  [ "$DOWNLOAD" = "1" ] && rm -f "$BAK"
  echo "==> Done."
else
  echo "Health check failed after rebuild." >&2
  if [ "$DOWNLOAD" = "1" ] && [ -f "$BAK" ]; then
    echo "Rolling back to previous feed..." >&2
    mv -f "$BAK" "$GTFS"
    docker compose up -d --force-recreate --wait --wait-timeout 600 otp isochrone || true
  fi
  exit 1
fi
