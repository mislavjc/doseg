#!/usr/bin/env bash
# Read-only: is this instance worth driving? Touches nothing, starts nothing.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd "$ROOT"

RUN="tmp/verify/run"
ok=0

row() { printf '%-22s %s\n' "$1" "$2"; }
code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo 000; }

app=$(code https://doseg.localhost/)
row "app (doseg.localhost)" "$app"
[[ $app == 200 ]] || ok=1

if [[ -f $RUN/next.pid ]] && kill -0 "$(cat "$RUN/next.pid")" 2>/dev/null; then
  row "owner" "ours (pid $(cat "$RUN/next.pid"))"
elif [[ $app == 200 ]]; then
  row "owner" "someone else's - do not restart it, down.sh will skip it"
else
  row "owner" "nothing running"
fi

row "isochrone :3002" "$(curl -sf -m 3 http://localhost:3002/health >/dev/null 2>&1 && echo up || echo down)"
row "OTP :8080" "$(curl -sf -m 3 http://localhost:8080/otp >/dev/null 2>&1 && echo up || echo down)"

# /api/health is 503 whenever OTP is missing a feed - that is the static tier,
# not a broken app.
row "/api/health" "$(code https://doseg.localhost/api/health)"

row "git" "$(git rev-parse --short HEAD 2>/dev/null) $(git status --porcelain | wc -l | tr -d ' ') dirty file(s)"
row "data" "$([[ -f data/walk-graph.bin ]] && echo walk-graph.bin || echo 'walk-graph.bin MISSING (scripts/setup-dev.sh)')"

if (( ok )); then
  echo
  echo "Not drivable. Start it: .claude/skills/verify-doseg/scripts/up.sh [--full]"
  echo "Startup log: tmp/verify/logs/next.log"
fi
exit $ok
