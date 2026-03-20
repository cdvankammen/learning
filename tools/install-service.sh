#!/usr/bin/env bash
# tools/install-service.sh — install the usbip-web systemd service
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

SERVICE_SRC="$REPO_ROOT/templates/usbip-web.service"
SERVICE_DST="/etc/systemd/system/usbip-web.service"
DRY_RUN="${DRY_RUN:-1}"

usage() {
  cat <<EOF
Usage: $0 [--install | --remove | --status]
  --install   Install and enable the systemd service
  --remove    Stop and remove the service
  --status    Show service status
  
Environment:
  DRY_RUN   Set to 0 to apply (default: 1)
EOF
  exit 2
}

ACTION="${1:---status}"

case "$ACTION" in
  --install)
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "DRY-RUN: would copy $SERVICE_SRC -> $SERVICE_DST"
      echo "DRY-RUN: would run systemctl daemon-reload && systemctl enable --now usbip-web"
      echo "Set DRY_RUN=0 to actually install."
    else
      cp "$SERVICE_SRC" "$SERVICE_DST"
      systemctl daemon-reload
      systemctl enable --now usbip-web
      echo "Service installed and started."
      systemctl status usbip-web --no-pager || true
    fi
    ;;
  --remove)
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "DRY-RUN: would stop and disable usbip-web, remove $SERVICE_DST"
    else
      systemctl stop usbip-web 2>/dev/null || true
      systemctl disable usbip-web 2>/dev/null || true
      rm -f "$SERVICE_DST"
      systemctl daemon-reload
      echo "Service removed."
    fi
    ;;
  --status)
    if systemctl is-active usbip-web >/dev/null 2>&1; then
      systemctl status usbip-web --no-pager
    else
      echo "usbip-web service is not running."
      echo "Install with: DRY_RUN=0 $0 --install"
    fi
    ;;
  *)
    usage
    ;;
esac
