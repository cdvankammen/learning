#!/usr/bin/env bash
set -euo pipefail
OUTDIR=${1:-/opt/actions-runner}
NAME=${2:-usbip-runner}

if [ ! -d "$OUTDIR" ]; then
  echo "Runner dir $OUTDIR not found; extract runner first (see docs/runner-setup.md)"
  exit 1
fi
cp /usbip/repo/tools/runner.service.template /etc/systemd/system/"${NAME}".service
systemctl daemon-reload
systemctl enable --now "${NAME}".service || true
echo "Installed and started systemd service ${NAME}.service"
