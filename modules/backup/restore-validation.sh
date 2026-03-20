#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/restore-validation.log
DUMP_DIR=/var/lib/vz/dump
DRY_RUN=1

if [[ "${RUN_ACTUAL:-0}" == "1" ]]; then
  DRY_RUN=0
fi

echo "restore-validation run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOG"

mapfile -t archives < <(find "$DUMP_DIR" -maxdepth 1 -type f -name 'vzdump-lxc-*.tar.*' -print)
if [[ ${#archives[@]} -eq 0 ]]; then
  echo "No archives found in $DUMP_DIR" >> "$LOG"
  exit 1
fi

file=$(printf "%s\n" "${archives[@]}" | shuf -n1)

echo "Selected archive: $file" >> "$LOG"

# Basic integrity test (list contents)
if command -v tar >/dev/null 2>&1; then
  if tar -tf "$file" >>"$LOG" 2>&1; then
    echo "Archive list OK" >> "$LOG"
  else
    echo "Archive list FAILED" >> "$LOG"
  fi
else
  echo "tar not available; skipping integrity list" >> "$LOG"
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY-RUN: skipping actual restore. To perform a real restore set RUN_ACTUAL=1 and ensure free VMID 590..599." >> "$LOG"
  exit 0
fi

# Find free VMID in 590..599
for vm in $(seq 590 599); do
  if [ ! -f "/etc/pve/lxc/${vm}.conf" ]; then
    freevm=$vm
    break
  fi
done

if [[ -z "${freevm:-}" ]]; then
  echo "No free VMID found in 590..599" >> "$LOG"
  exit 2
fi

echo "Restoring to VMID $freevm" >> "$LOG"
if ! pct restore "$freevm" "$file" --storage local >>"$LOG" 2>&1; then
  echo "pct restore failed" >> "$LOG"
  exit 3
fi

if ! pct start "$freevm" >>"$LOG" 2>&1; then
  echo "pct start failed for $freevm" >>"$LOG"
  pct destroy "$freevm" >>"$LOG" 2>&1 || true
  exit 4
fi

sleep 10
if pct exec "$freevm" -- systemctl is-system-running >/dev/null 2>&1; then
  echo "container $freevm booted successfully" >> "$LOG"
else
  echo "container $freevm did not reach running state" >> "$LOG"
fi

# Cleanup
pct stop "$freevm" >>"$LOG" 2>&1 || true
pct destroy "$freevm" >>"$LOG" 2>&1 || true

echo "Restore validation finished" >> "$LOG"
