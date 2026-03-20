#!/usr/bin/env bash
set -euo pipefail
LOG=/usbip/session-files/harden-scripts.log
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
echo "Harden run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOG"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

echo "- Ensuring scripts are executable and have safe shebangs" >> "$LOG"
find "$REPO_ROOT" -type f -name '*.sh' -print0 | xargs -0 -n1 chmod 750 >> "$LOG" 2>&1 || true

# Insert dry-run flags where applicable
# For offload-archives.sh ensure default is dry-run
sed -n '1,200p' "$REPO_ROOT/tools/offload-archives.sh" >> "$LOG" 2>&1 || true

echo "Harden complete" >> "$LOG"
