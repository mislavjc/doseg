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
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" reset --hard origin/main
else
  echo "==> Cloning repo..."
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# Run server hardening (idempotent)
echo "==> Running server hardening..."
bash "$APP_DIR/server/harden.sh"

# Write .env
echo "DOMAIN=$DOMAIN" > .env

wait_for_otp() {
  echo "==> Waiting for OTP to become healthy..."
  docker compose logs -f otp &
  LOG_PID=$!
  timeout 180 bash -c 'until docker compose ps otp | grep -q healthy; do sleep 5; done' || {
    echo "WARNING: OTP did not become healthy within 3 minutes"
    kill $LOG_PID 2>/dev/null
    exit 1
  }
  kill $LOG_PID 2>/dev/null
}

# Download data and build graphs if not present
if [ ! -f data/graph.obj ]; then
  echo "==> Setting up data files..."
  ./scripts/setup-data.sh
else
  echo "==> Data files already present, skipping setup"
fi

if [ ! -f data/district-scores.json ]; then
  echo "==> Starting OTP for district score generation..."
  docker compose up -d --build otp
  wait_for_otp

  echo "==> Installing Rust toolchain (if needed)..."
  if ! command -v cargo &>/dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    . "$HOME/.cargo/env"
  fi

  echo "==> Building and running district scoring..."
  cd scoring && cargo build --release && cargo run --release && cd ..
fi

# Build and start
echo "==> Starting services..."
docker compose up -d --build

wait_for_otp

echo ""
echo "==> Deployed! Site should be live at https://$DOMAIN"
REMOTE
