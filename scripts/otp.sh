#!/usr/bin/env bash
# Provide OTP on localhost:8080 for local dev, picking the best available source:
#   1. Reuse whatever is already serving :8080 (don't double-start).
#   2. Tunnel to the production OTP on `netcup` if it's reachable over SSH.
#   3. Otherwise start OTP locally via Docker
#      (needs docker-compose.override.yml to expose :8080).
set -euo pipefail
cd "$(dirname "$0")/.."

if curl -sf -m 2 http://localhost:8080/otp >/dev/null 2>&1; then
  echo "==> OTP already serving on :8080 — reusing it."
  # Keep this mprocs pane alive without managing an OTP we didn't start.
  exec tail -f /dev/null
fi

# BatchMode=yes makes SSH fail fast instead of prompting when `netcup` is
# missing/unreachable, so we cleanly fall through to local Docker.
if ssh -o BatchMode=yes -o ConnectTimeout=3 netcup true 2>/dev/null; then
  ip=$(ssh netcup "docker inspect doseg-otp-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'" 2>/dev/null || true)
  if [ -n "$ip" ]; then
    echo "==> Tunneling to production OTP on netcup ($ip:8080)..."
    exec ssh -NL "8080:${ip}:8080" netcup
  fi
  echo "==> netcup reachable but doseg-otp-1 not found there — falling back to local Docker."
fi

echo "==> Starting OTP locally via Docker..."
exec docker compose up otp
