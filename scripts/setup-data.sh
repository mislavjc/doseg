#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

GTFS_URL="https://zet.hr/gtfs-scheduled/latest"
OSM_URL="https://download.geofabrik.de/europe/croatia-latest.osm.pbf"

echo "==> Downloading GTFS feed..."
mkdir -p data/gtfs
curl -fSL -o data/gtfs/zet.zip "$GTFS_URL"
echo "    saved data/gtfs/zet.zip ($(du -h data/gtfs/zet.zip | cut -f1))"

echo "==> Downloading OSM extract..."
mkdir -p data/osm
curl -fSL -o data/osm/croatia.osm.pbf "$OSM_URL"
echo "    saved data/osm/croatia.osm.pbf ($(du -h data/osm/croatia.osm.pbf | cut -f1))"

echo "==> Building OTP graph..."
docker compose run --rm otp --build --save

echo "==> Building walk graph..."
docker run --rm -v "$PWD:/app" -w /app oven/bun:latest sh -c "bun install --frozen-lockfile && bun scripts/build-walk-graph.ts"

echo "==> Done! Data files:"
ls -lh data/gtfs/zet.zip data/osm/croatia.osm.pbf data/graph.obj data/walk-graph.bin
