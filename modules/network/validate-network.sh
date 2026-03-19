#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/network-validate.log

echo "Network validation run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"

VMIDS=("$@")
if [ ${#VMIDS[@]} -eq 0 ]; then
  VMIDS=()
  for i in $(seq 500 599); do VMIDS+=("$i"); done
fi

for id in "${VMIDS[@]}"; do
  if [ ! -f "/etc/pve/lxc/${id}.conf" ]; then
    echo "skip ${id} (no config)" >> "$LOG"
    continue
  fi
  if pct status "$id" 2>/dev/null | grep -q '^status: running'; then
    echo "checking ${id}" >> "$LOG"
    # run a light connectivity check inside the container
    pct exec "$id" -- bash -lc "ip -4 -o addr show || true; ping -c1 -W2 1.1.1.1 >/dev/null 2>&1 && echo 'PING:OK' || echo 'PING:FAIL'" >> "$LOG" 2>&1 || echo "exec failed for ${id}" >> "$LOG"
  else
    echo "skip ${id} (not running)" >> "$LOG"
  fi
done

exit 0
