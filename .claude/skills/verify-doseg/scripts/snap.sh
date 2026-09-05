#!/usr/bin/env bash
# The 80% proof: open a page, wait for something real, screenshot it, and
# report console errors plus non-2xx/3xx requests. Anything more interactive
# runs as raw agent-browser commands (see the feature files).
#
#   ./snap.sh /linije/1 --wait "Vozni red"
#   ./snap.sh /statistika --full --name statistika
#   ./snap.sh "/karta?lat=45.81&lon=15.98" --wait "dohvatljivo"
#
# Evidence lands in tmp/verify/<name>-<stamp>/ and survives down.sh.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd "$ROOT"
source "$(dirname "${BASH_SOURCE[0]}")/session.sh"

PATH_ARG=${1:-}
[[ $PATH_ARG == /* ]] || { echo "usage: snap.sh /path [--wait <text>] [--full] [--name <n>]" >&2; exit 2; }
shift

WAIT=""; FULL=""; NAME=""; SETTLE=0
while (( $# )); do
  case $1 in
    --wait) WAIT=$2; shift 2 ;;
    --full) FULL="--full"; shift ;;
    --name) NAME=$2; shift 2 ;;
    --settle) SETTLE=$2; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -z $NAME ]]; then
  NAME=$(echo "${PATH_ARG#/}" | sed 's/[?&=].*//; s#/#-#g')
  NAME=${NAME:-home}
fi
OUT="tmp/verify/${NAME}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

ab console --clear >/dev/null
ab network requests --clear >/dev/null
ab open "https://doseg.localhost${PATH_ARG}"

if [[ -n $WAIT ]]; then
  ab wait --text "$WAIT" || { echo "!! never saw \"$WAIT\" on $PATH_ARG" >&2; ab screenshot "$OUT/failed.png"; exit 1; }
else
  ab wait --load networkidle >/dev/null || true
fi

# The sidebar text lands before MapLibre has painted a frame, so /karta needs
# a settle or the canvas comes out blank white.
(( SETTLE > 0 )) && ab wait "$SETTLE" >/dev/null

ab screenshot $FULL "$OUT/$NAME.png"

# Dev-only chatter that says nothing about the app: agentation's toolbar
# (localhost:4747), Next's HMR socket, the React DevTools nag.
NOISE='4747|\[HMR\]|React DevTools|Agentation'

ab console | grep -Ev "$NOISE" | grep -E '^\[(error|warning)\]' > "$OUT/console.txt" || true
# A line ends in its status code; requests still in flight when we look have
# no status at all, so only judge the ones that finished.
ab network requests | grep -Ev "$NOISE" \
  | awk '$NF ~ /^[0-9]+$/ && $NF !~ /^[23][0-9][0-9]$/' > "$OUT/bad-requests.txt" || true

echo
echo "== $PATH_ARG -> $OUT"
if [[ -s $OUT/console.txt ]]; then echo "== console:"; cat "$OUT/console.txt"; fi
if [[ -s $OUT/bad-requests.txt ]]; then echo "== non-2xx/3xx requests:"; cat "$OUT/bad-requests.txt"; fi
[[ -s $OUT/console.txt || -s $OUT/bad-requests.txt ]] || echo "== clean (no console errors, no failed requests)"
