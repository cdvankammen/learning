#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/integration-smoke.log
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

echo "Integration smoke run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"

# Defaults
RUN_ACTUAL=${RUN_ACTUAL:-0}  # set to 1 to perform real create
CLEANUP=${CLEANUP:-1}        # if real create, destroy container afterwards
VMID_RANGE_START=590
VMID_RANGE_END=599

if ! command -v pct >/dev/null 2>&1; then
  echo "pct not available; aborting" >> "$LOG"
  exit 2
fi

# find a free VMID in the test range
FREE=""
for i in $(seq "$VMID_RANGE_START" "$VMID_RANGE_END"); do
  if [ ! -f "/etc/pve/lxc/${i}.conf" ]; then
    FREE="$i"
    break
  fi
done

if [ -z "$FREE" ]; then
  echo "No free VMID available in $VMID_RANGE_START..$VMID_RANGE_END" >> "$LOG"
  exit 1
fi

echo "Selected VMID $FREE for smoke test" >> "$LOG"

# locate Debian 13 template
TEMPLATE=$(find /var/lib/vz/template/cache -maxdepth 1 -type f -name '*debian*13*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | sed 's/^[0-9.]* //') || true
if [ -z "$TEMPLATE" ]; then
  echo "No Debian 13 template found; aborting" >> "$LOG"
  exit 1
fi

echo "Using template: ${TEMPLATE}" >> "$LOG"

# Run provisioning script in dry-run unless RUN_ACTUAL=1
if [ "$RUN_ACTUAL" -eq 1 ]; then
  echo "Creating actual LXC $FREE from $TEMPLATE" >> "$LOG"
  /usbip/repo/modules/lxc-provision/create-lxc-defaults.sh -i "$FREE" -h "smoke-test-$FREE" >> "$LOG" 2>&1 || { echo "pct create failed" >> "$LOG"; exit 1; }
  CREATED=1
else
  echo "DRY-RUN: create-lxc-defaults.sh -n -i $FREE -h smoke-test-$FREE" >> "$LOG"
  /usbip/repo/modules/lxc-provision/create-lxc-defaults.sh -n -i "$FREE" -h "smoke-test-$FREE" >> "$LOG" 2>&1 || echo "DRY-RUN returned non-zero" >> "$LOG"
  CREATED=0
fi

# If created actually, run network validation, backup, and optional cleanup
if [ "$CREATED" -eq 1 ]; then
  sleep 3
  /usbip/repo/modules/network/validate-network.sh "$FREE" >> "$LOG" 2>&1 || echo "validate-network failed" >> "$LOG"

  if command -v vzdump >/dev/null 2>&1; then
    echo "Backing up smoke LXC $FREE" >> "$LOG"
    vzdump "$FREE" --dumpdir /var/lib/vz/dump --compress lzo --mode stop >> "$LOG" 2>&1 || echo "vzdump failed for $FREE" >> "$LOG"
  fi

  if [ "$CLEANUP" -eq 1 ]; then
    echo "Destroying smoke LXC $FREE" >> "$LOG"
    pct destroy "$FREE" >> "$LOG" 2>&1 || echo "pct destroy failed for $FREE" >> "$LOG"
  fi
fi

echo "Integration smoke completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
exit 0
