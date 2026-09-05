#!/usr/bin/env bash
# Tear down only what up.sh started, by recorded PID and its children. Never
# kills by process name - a stray `pkill next` would take out the user's own
# dev server. Evidence under tmp/verify/<run>/ is left untouched.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd "$ROOT"

RUN="tmp/verify/run"

kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null
}

# Reverse of startup order: isochrone, OTP, then Next.
for name in isochrone otp next; do
  f="$RUN/$name.pid"
  [[ -f $f ]] || continue
  pid=$(cat "$f")
  if kill -0 "$pid" 2>/dev/null; then
    echo "==> Stopping $name (pid $pid)"
    kill_tree "$pid"
    for _ in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -9 "$pid" 2>/dev/null
  else
    echo "==> $name (pid $pid) already gone"
  fi
  rm -f "$f"
done

echo "==> Down. Evidence kept in tmp/verify/ (logs in tmp/verify/logs/)."
