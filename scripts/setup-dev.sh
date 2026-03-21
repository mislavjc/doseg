#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DATA_CDN="https://data.doseg.mislavjc.com"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# Check prerequisites
for cmd in bun cargo curl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is not installed."
    case "$cmd" in
      bun)   echo "  Install: https://bun.sh/" ;;
      cargo) echo "  Install: https://rustup.rs/" ;;
      curl)  echo "  Install via your package manager" ;;
    esac
    exit 1
  fi
done

echo "==> Setting up doseg development environment"
echo ""

# 1. Node dependencies
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  bun install --frozen-lockfile
else
  echo "==> Dependencies already installed"
fi

# 2. Download data files in parallel
download() {
  local dest="$1" url="$2"
  local tmp="${dest}.tmp"
  curl -fSL -o "$tmp" "$url"
  mv "$tmp" "$dest"
}

PIDS=()

if $FORCE || [ ! -f data/walk-graph.bin ]; then
  echo "==> Downloading walk-graph.bin (~15MB)..."
  download data/walk-graph.bin "$DATA_CDN/walk-graph.bin" &
  PIDS+=($!)
else
  echo "==> Walk graph already exists"
fi

if $FORCE || [ ! -f data/gtfs/zet.zip ]; then
  echo "==> Downloading GTFS feed..."
  mkdir -p data/gtfs
  download data/gtfs/zet.zip "$DATA_CDN/gtfs/zet.zip" &
  PIDS+=($!)
else
  echo "==> GTFS data already exists"
fi

FAIL=0
for pid in "${PIDS[@]+"${PIDS[@]}"}"; do
  wait "$pid" || FAIL=1
done
if [ "$FAIL" -ne 0 ]; then
  echo "Error: one or more downloads failed."
  exit 1
fi

# 3. Build Rust isochrone server
echo "==> Building isochrone server (release)..."
cargo build --release --bin isochrone-server --manifest-path transit/Cargo.toml

echo ""
echo "==> Setup complete! To start developing:"
echo ""
echo "   Option A: Use production OTP (requires SSH access to server)"
echo "     mprocs"
echo "     Visit: http://doseg.localhost:1355"
echo ""
echo "   Option B: Run OTP locally"
echo "     docker compose up -d otp         # wait ~2 min for graph build"
echo "     OTP_URL=http://localhost:8080 DATA_DIR=data PORT=3002 cargo run --release --bin isochrone-server --manifest-path transit/Cargo.toml"
echo "     bun dev"
echo "     Visit: http://doseg.localhost:1355"
echo ""
echo "   Re-download data: ./scripts/setup-dev.sh --force"
echo ""
