#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [--dir DIR] [--name NAME]
  --dir   Path to the extracted GitHub Actions runner directory (default: /opt/actions-runner)
  --name  Systemd service name (default: usbip-runner)

Positional arguments are also accepted for backwards compatibility:
  $0 [DIR] [NAME]
EOF
}

OUTDIR="/opt/actions-runner"
NAME="usbip-runner"
OUTDIR_SET=0
NAME_SET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      OUTDIR="${2:?--dir requires a value}"
      OUTDIR_SET=1
      shift 2
      ;;
    --name)
      NAME="${2:?--name requires a value}"
      NAME_SET=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
    *)
      if [[ $OUTDIR_SET -eq 0 ]]; then
        OUTDIR="$1"
        OUTDIR_SET=1
      elif [[ $NAME_SET -eq 0 ]]; then
        NAME="$1"
        NAME_SET=1
      else
        echo "Unexpected positional argument: $1"
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

if [ ! -d "$OUTDIR" ]; then
  echo "Runner dir $OUTDIR not found; extract runner first (see docs/runner-setup.md)"
  exit 1
fi
cp "$REPO_ROOT/tools/runner.service.template" /etc/systemd/system/"${NAME}".service
systemctl daemon-reload
systemctl enable --now "${NAME}".service || true
echo "Installed and started systemd service ${NAME}.service"
