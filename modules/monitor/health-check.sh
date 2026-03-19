#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/health-check.log

echo "Health check run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
DUMP_DIR=/var/lib/vz/dump
REPORT=0

# Disk usage check
if [ -d "$DUMP_DIR" ]; then
  USAGE=$(df -P "$DUMP_DIR" | awk 'NR==2{gsub(/%/,"",$5); print $5}')
  echo "$(date -u): dump fs usage ${USAGE}%" >> "$LOG"
  if [ "$USAGE" -ge 90 ]; then
    echo "CRITICAL: disk usage >= 90%" >> "$LOG"
    REPORT=2
  fi
else
  echo "CRITICAL: dump dir $DUMP_DIR not found" >> "$LOG"
  REPORT=2
fi

# Latest CT500 backup age check
LATEST=$(ls -1t "$DUMP_DIR"/vzdump-lxc-500-*.tar.* 2>/dev/null | head -n1 || true)
if [ -z "$LATEST" ]; then
  echo "$(date -u): NO BACKUP found for CT500" >> "$LOG"
  REPORT=2
else
  MTIME=$(stat -c %Y "$LATEST" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$((NOW - MTIME))
  echo "$(date -u): latest CT500 backup age ${AGE}s" >> "$LOG"
  if [ "$AGE" -gt 14400 ]; then
    echo "STALE: backup older than 4h" >> "$LOG"
    REPORT=1
  fi
fi

# Count vzdump archives
NUM=$(ls -1 "$DUMP_DIR"/vzdump-lxc-*.tar.* 2>/dev/null | wc -l || echo 0)
echo "$(date -u): total vzdump archives: $NUM" >> "$LOG"

if [ "$REPORT" -gt 0 ]; then
  echo "Health check reported issues, exit code $REPORT" >> "$LOG"
  exit "$REPORT"
else
  echo "OK" >> "$LOG"
  exit 0
fi
