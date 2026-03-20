#!/usr/bin/env bash
set -euo pipefail

# create-lxc-safe.sh [VMID] [TEMPLATE] [PASSWORD] [MEM] [CORES] [NET] [STORAGE]
# Defaults: TEMPLATE=ubuntu-22.04 template from local pveam, PASSWORD=violin

VMID="${1:-}"
TEMPLATE="${2:-local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst}"
PASSWORD="${3:-violin}"
MEM="${4:-1024}"
CORES="${5:-1}"
NET="${6:-name=eth0,bridge=vmbr0}"
STORAGE="${7:-local}"

if [ -z "$VMID" ]; then
  for id in $(seq 500 999); do
    if ! pct status "$id" &>/dev/null && [ ! -f "/etc/pve/lxc/$id.conf" ]; then
      VMID="$id"
      break
    fi
  done
fi

if [ -z "$VMID" ]; then
  echo "No free VMID found in 500-999" >&2
  exit 1
fi

echo "Using VMID=$VMID TEMPLATE=$TEMPLATE PASSWORD=[redacted] MEM=$MEM CORES=$CORES NET=$NET STORAGE=$STORAGE"

# Verify template exists in local
if ! pveam list local 2>/dev/null | grep -q "$(basename "$TEMPLATE")"; then
  echo "Template $TEMPLATE not found in local templates. Download with: pveam download local $(basename "$TEMPLATE")" >&2
  exit 2
fi

# Create the container
pct create "$VMID" "$TEMPLATE" \
  --hostname "usbip-$VMID" \
  --memory "$MEM" \
  --cores "$CORES" \
  --net0 "$NET" \
  --password "$PASSWORD" \
  --rootfs "${STORAGE}:4" \
  --onboot 0 || { echo "pct create failed" >&2; exit 3; }

echo "Created CT $VMID"
