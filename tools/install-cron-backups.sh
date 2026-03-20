#!/usr/bin/env bash
# tools/install-cron-backups.sh — install a cron job for automated LXC backups
set -euo pipefail

CRON_SCHEDULE="${CRON_SCHEDULE:-0 */4 * * *}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

BACKUP_SCRIPT="$REPO_ROOT/tools/backup-500-range.sh"
PRUNE_SCRIPT="$REPO_ROOT/modules/backup/prune-backups.sh"
HEALTH_SCRIPT="$REPO_ROOT/modules/monitor/health-check.sh"
CRON_FILE="/etc/cron.d/usbip-backups"
DRY_RUN="${DRY_RUN:-1}"

usage() {
  cat <<EOF
Usage: $0 [--install | --remove | --show]
  --install   Install cron job (use DRY_RUN=0 to actually install)
  --remove    Remove installed cron job
  --show      Show what would be installed
  
Environment:
  CRON_SCHEDULE   Cron schedule (default: every 4 hours)
  DRY_RUN         Set to 0 to apply (default: 1)
EOF
  exit 2
}

CRON_CONTENT="# USB/IP automated backups — managed by install-cron-backups.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Run backups every 4 hours
${CRON_SCHEDULE} root ${BACKUP_SCRIPT} >> /var/log/usbip-backup.log 2>&1

# Prune old backups daily at 3am (keep 10)
0 3 * * * root ${PRUNE_SCRIPT} -k 10 >> /var/log/usbip-prune.log 2>&1

# Health check every hour
0 * * * * root ${HEALTH_SCRIPT} >> /var/log/usbip-health.log 2>&1
"

ACTION="${1:---show}"

case "$ACTION" in
  --show)
    echo "=== Cron content that would be installed to $CRON_FILE ==="
    echo "$CRON_CONTENT"
    ;;
  --install)
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "DRY-RUN: would write to $CRON_FILE:"
      echo "$CRON_CONTENT"
      echo "Set DRY_RUN=0 to actually install."
    else
      echo "$CRON_CONTENT" > "$CRON_FILE"
      chmod 644 "$CRON_FILE"
      echo "Installed cron job to $CRON_FILE"
    fi
    ;;
  --remove)
    if [ -f "$CRON_FILE" ]; then
      if [ "$DRY_RUN" -eq 1 ]; then
        echo "DRY-RUN: would remove $CRON_FILE"
      else
        rm -f "$CRON_FILE"
        echo "Removed $CRON_FILE"
      fi
    else
      echo "No cron file found at $CRON_FILE"
    fi
    ;;
  *)
    usage
    ;;
esac
