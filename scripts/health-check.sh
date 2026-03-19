#!/bin/bash
# Health check for doseg containers. Run via cron every 5 minutes:
# */5 * * * * /opt/doseg/scripts/health-check.sh

WEBHOOK_URL="${DOSEG_ALERT_WEBHOOK:-}"
CONTAINERS=("doseg-otp-1" "doseg-isochrone-1" "doseg-app-1" "doseg-caddy-1")

for c in "${CONTAINERS[@]}"; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$c" 2>/dev/null)
  if [ -z "$STATUS" ]; then
    STATUS="not found"
  fi
  if [ "$STATUS" != "healthy" ]; then
    MSG="[doseg] Container $c is $STATUS"
    echo "$MSG"
    if [ -n "$WEBHOOK_URL" ]; then
      curl -sf -d "$MSG" "$WEBHOOK_URL" >/dev/null 2>&1
    fi
  fi
done
