#!/usr/bin/env bash
set -euo pipefail

# Deploy doseg to a fresh server via SSH.
# Usage: ./scripts/deploy.sh user@host repo-url domain
#
# Example:
#   ./scripts/deploy.sh root@203.0.113.10 git@github.com:mislav/doseg.git doseg.example.com

HOST="${1:?Usage: deploy.sh user@host repo-url domain}"
REPO="${2:?Usage: deploy.sh user@host repo-url domain}"
DOMAIN="${3:?Usage: deploy.sh user@host repo-url domain}"

APP_DIR="/opt/doseg"

echo "==> Deploying to $HOST"

ssh "$HOST" bash -s "$REPO" "$DOMAIN" "$APP_DIR" <<'REMOTE'
set -euo pipefail
REPO="$1"
DOMAIN="$2"
APP_DIR="$3"

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# Clone or pull repo
if [ -d "$APP_DIR" ]; then
  echo "==> Pulling latest code..."
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Cloning repo..."
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# Write .env
echo "DOMAIN=$DOMAIN" > .env

# Download data and build graphs if not present
if [ ! -f data/graph.obj ]; then
  echo "==> Setting up data files..."
  ./scripts/setup-data.sh
else
  echo "==> Data files already present, skipping setup"
fi

# Build and start
echo "==> Starting services..."
docker compose up -d --build

echo "==> Waiting for OTP to become healthy..."
docker compose logs -f otp &
LOG_PID=$!
timeout 180 bash -c 'until docker compose ps otp | grep -q healthy; do sleep 5; done' || {
  echo "WARNING: OTP did not become healthy within 3 minutes"
  kill $LOG_PID 2>/dev/null
  exit 1
}
kill $LOG_PID 2>/dev/null

# Pre-generate district scores for /statistika (app container has Node, not Bun)
if [ ! -f data/district-scores.json ]; then
  echo "==> Generating district scores..."
  docker run --rm --network doseg_default -e OTP_URL=http://otp:8080 \
    -v "$PWD:/app" -w /app oven/bun:latest \
    bun scripts/score-districts.ts
fi

echo ""
echo "==> Deployed! Site should be live at https://$DOMAIN"
REMOTE
