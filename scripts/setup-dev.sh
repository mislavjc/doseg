#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DATA_CDN="https://pub-e91a4280dfda4c0598b3507d352cf417.r2.dev"

echo "==> Setting up doseg development environment"
echo ""

# 1. Node dependencies
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  bun install --frozen-lockfile
else
  echo "==> Dependencies already installed"
fi

# 2. Walk graph (needed by isochrone server)
if [ ! -f data/walk-graph.bin ]; then
  echo "==> Downloading walk-graph.bin (~15MB)..."
  curl -fSL -o data/walk-graph.bin "$DATA_CDN/walk-graph.bin"
  echo "    Downloaded $(du -h data/walk-graph.bin | cut -f1)"
else
  echo "==> Walk graph already exists"
fi

# 3. GTFS data (needed by OTP)
if [ ! -f data/gtfs/zet.zip ]; then
  echo "==> Downloading GTFS feed..."
  mkdir -p data/gtfs
  curl -fSL -o data/gtfs/zet.zip "https://zet.hr/gtfs-scheduled/latest"
  echo "    Downloaded $(du -h data/gtfs/zet.zip | cut -f1)"
else
  echo "==> GTFS data already exists"
fi

# 4. Build Rust isochrone server
echo "==> Building isochrone server (release)..."
cargo build --release --bin isochrone-server --manifest-path transit/Cargo.toml

echo ""
echo "==> Setup complete! To start developing:"
echo ""
echo "   Option A: Use production OTP (requires SSH access to server)"
echo "     mprocs"
echo ""
echo "   Option B: Run OTP locally"
echo "     docker compose up -d otp         # wait ~2 min for graph build"
echo "     OTP_URL=http://localhost:8080 DATA_DIR=data PORT=3002 cargo run --release --bin isochrone-server --manifest-path transit/Cargo.toml"
echo "     bun dev"
echo ""
