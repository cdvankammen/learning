#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/uptime-kuma-automation.log
DB_CANDIDATES=("/opt/uptime-kuma/data/db.sqlite" "/var/lib/uptime-kuma/db.sqlite" "/home/uptime-kuma/data/db.sqlite")

echo "uptime-kuma automation run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOG"

found=
for p in "${DB_CANDIDATES[@]}"; do
  if [ -f "$p" ]; then
    found=$p
    break
  fi
done

if [[ -z "$found" ]]; then
  echo "Uptime-Kuma DB not found in common locations; manual config required" >> "$LOG"
  echo "Please locate db.sqlite and run this script again with DB path as argument" >> "$LOG"
  exit 0
fi

backup=/usbip/session-files/uptime-kuma-db-$(date -u +%Y%m%dT%H%M%SZ).sqlite
cp "$found" "$backup"
chmod 600 "$backup"

echo "Backed up uptime-kuma DB to $backup" >> "$LOG"

if command -v sqlite3 >/dev/null 2>&1; then
  echo "Users table info (if available):" >> "$LOG"
  sqlite3 "$found" ".tables" >> "$LOG" 2>&1 || true
  # Do not attempt to auto-insert users; warn and provide next steps
  echo "Automated admin creation is sensitive. If no admin exists, consider using the web UI, or provide exact migration steps and hashed password to insert." >> "$LOG"
else
  echo "sqlite3 not found; cannot inspect DB. Backup created at $backup" >> "$LOG"
fi

echo "uptime-kuma automation finished" >> "$LOG"
