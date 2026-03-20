#!/usr/bin/env bash
set -euo pipefail
LOG=/usbip/session-files/secret-scan.log
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

TARGET_DIR="${1:-$REPO_ROOT}"
echo "Secret scan at $(date -u +%Y-%m-%dT%H:%M:%SZ) for $TARGET_DIR" > "$LOG"
# simple grep for tokens - reduce false positives
echo "Scanning $TARGET_DIR (excluding .git, node_modules)" >> "$LOG"
grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E "(PRIVATE_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN|password|secret)" "$TARGET_DIR" >> "$LOG" || true

echo "Review $TARGET_DIR and /usbip/session-files for any accidental secrets" >> "$LOG"
