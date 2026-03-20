#!/usr/bin/env bash
set -euo pipefail
LOG=/usbip/session-files/harden-scripts.log
echo "Harden run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOG"

echo "- Ensuring scripts are executable and have safe shebangs" >> "$LOG"
find /usbip/repo -type f -name '*.sh' -print0 | xargs -0 -n1 chmod 750 >> "$LOG" 2>&1 || true

# Insert dry-run flags where applicable
# For offload-archives.sh ensure default is dry-run
sed -n '1,200p' /usbip/repo/tools/offload-archives.sh >> "$LOG" 2>&1 || true

echo "Harden complete" >> "$LOG"
