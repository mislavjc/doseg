#!/usr/bin/env bash
# Start doseg for verification. Records only the PIDs it starts, so down.sh
# can never kill an instance somebody else was using.
#
#   ./up.sh            # Next dev only: every page except live isochrones
#   ./up.sh --full     # + OTP on :8080 and the Rust isochrone server on :3002
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd "$ROOT"

RUN="tmp/verify/run"
LOGS="tmp/verify/logs"
mkdir -p "$RUN" "$LOGS"

FULL=false
[[ ${1:-} == "--full" ]] && FULL=true

alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }
code()  { curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo 000; }

wait_for() { # wait_for <label> <check-cmd> <seconds> <logfile>
  local what=$1 check=$2 secs=$3 log=$4 i=0
  while (( i < secs )); do
    if eval "$check"; then echo "==> $what ready (${i}s)"; return 0; fi
    sleep 2; i=$(( i + 2 ))
  done
  echo "!! $what never came up in ${secs}s. Last 30 lines of $log:" >&2
  tail -30 "$log" >&2 || true
  return 1
}

# 1. Next dev behind portless at https://doseg.localhost.
# portless owns that hostname: a second dev server cannot have it, so an
# already-serving instance is reused rather than duplicated.
if [[ $(code https://doseg.localhost/) == 200 ]]; then
  if alive "$RUN/next.pid"; then
    echo "==> Next already running (ours, pid $(cat "$RUN/next.pid")) - reusing."
  else
    echo "==> Next already running (not started by us) - reusing, down.sh will leave it alone."
  fi
else
  echo "==> Starting Next dev..."
  nohup bun dev > "$LOGS/next.log" 2>&1 &
  echo $! > "$RUN/next.pid"
  wait_for "Next" '[[ $(code https://doseg.localhost/) == 200 ]]' 150 "$LOGS/next.log" \
    || { rm -f "$RUN/next.pid"; exit 1; }
fi

$FULL || { echo "==> Up (static tier). Isochrones need --full."; exit 0; }

# 2. OTP on :8080. scripts/otp.sh picks its own source: reuse -> ssh tunnel to
# netcup -> local Docker (that last one builds a graph, hence the long wait).
if curl -sf -m 3 http://localhost:8080/otp >/dev/null 2>&1; then
  echo "==> OTP already serving on :8080 - reusing."
else
  echo "==> Starting OTP (scripts/otp.sh)..."
  nohup ./scripts/otp.sh > "$LOGS/otp.log" 2>&1 &
  echo $! > "$RUN/otp.pid"
  wait_for "OTP" 'curl -sf -m 3 http://localhost:8080/otp >/dev/null 2>&1' 300 "$LOGS/otp.log" \
    || { echo "!! No OTP: /karta renders but every isochrone request will fail." >&2; exit 1; }
fi

# 3. Rust isochrone server on :3002 (next.config rewrites /api/isochrone here).
if curl -sf -m 3 http://localhost:3002/health >/dev/null 2>&1; then
  echo "==> Isochrone server already on :3002 - reusing."
else
  echo "==> Starting isochrone server (release build, first run compiles)..."
  OTP_URL=http://localhost:8080 DATA_DIR=data RT_DB_DIR=data PORT=3002 \
    nohup cargo run --release --manifest-path transit/Cargo.toml --bin isochrone-server \
    > "$LOGS/isochrone.log" 2>&1 &
  echo $! > "$RUN/isochrone.pid"
  wait_for "isochrone server" 'curl -sf -m 3 http://localhost:3002/health >/dev/null 2>&1' 600 "$LOGS/isochrone.log" \
    || { rm -f "$RUN/isochrone.pid"; exit 1; }
fi

echo "==> Up (full tier). https://doseg.localhost"
