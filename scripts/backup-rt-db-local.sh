#!/usr/bin/env bash
set -euo pipefail

# Create an atomic SQLite backup of the GTFS-RT database.
# Run on the server via cron. Keeps last 7 days.

CONTAINER="doseg-isochrone-1"
DB_PATH="/app/rt-db/gtfs-rt.db"
BACKUP_DIR="/opt/doseg-backups"
DATE=$(date -u +%Y-%m-%d)

mkdir -p "$BACKUP_DIR"

# Copy DB + WAL from container
docker cp "$CONTAINER:$DB_PATH" /tmp/rt-src.db
docker cp "$CONTAINER:${DB_PATH}-wal" /tmp/rt-src.db-wal 2>/dev/null || true
docker cp "$CONTAINER:${DB_PATH}-shm" /tmp/rt-src.db-shm 2>/dev/null || true

# Atomic backup (replays WAL into a clean file)
sqlite3 /tmp/rt-src.db ".backup $BACKUP_DIR/gtfs-rt-${DATE}.db"
rm -f /tmp/rt-src.db /tmp/rt-src.db-wal /tmp/rt-src.db-shm

# Compress
zstd -f --rm "$BACKUP_DIR/gtfs-rt-${DATE}.db" -o "$BACKUP_DIR/gtfs-rt-${DATE}.db.zst"

# Delete backups older than 7 days
find "$BACKUP_DIR" -name "gtfs-rt-*.db.zst" -mtime +7 -delete

echo "Backup done: $BACKUP_DIR/gtfs-rt-${DATE}.db.zst ($(du -h "$BACKUP_DIR/gtfs-rt-${DATE}.db.zst" | cut -f1))"
