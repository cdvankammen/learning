#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/restore-or-replace.log

echo "Started at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"

DRY_RUN=0
VMIDS=(300 420)
RANGE_START=500
RANGE_END=599
TEMPLATE="/var/lib/vz/template/cache/debian-13-standard_13.1-2_amd64.tar.zst"

usage(){
  cat <<EOF
Usage: $0 [-n|--dry-run] [--vmids 300,420]
  -n, --dry-run   Do not apply changes; only log actions
  --vmids         Comma-separated list of original VMIDs to process (default: 300,420)
EOF
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|--dry-run)
      DRY_RUN=1; shift ;;
    --vmids)
      shift
      IFS=',' read -r -a VMIDS <<< "$1"
      shift ;;
    -h|--help)
      usage ;;
    *)
      echo "Unknown argument: $1" >&2; usage ;;
  esac
done

log(){
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"
}

find_free_id(){
  for i in $(seq "$RANGE_START" "$RANGE_END"); do
    if [ ! -f "/etc/pve/lxc/${i}.conf" ]; then
      echo "$i"
      return 0
    fi
  done
  return 1
}

for vmid in "${VMIDS[@]}"; do
  if [ -f "/etc/pve/lxc/${vmid}.conf" ]; then
    log "Original VMID ${vmid} already exists on host; skipping."
    continue
  fi

  log "Processing missing original VMID ${vmid}"

  VZDUMP=$(ls -1t /var/lib/vz/dump/vzdump-lxc-${vmid}-*.tar.lzo 2>/dev/null | head -n1 || true)
  FILEBACKUP=$(ls -1t /var/lib/vz/dump/filebackup-${vmid}-rootfs-*.tar.xz 2>/dev/null | head -n1 || true)

  if [ -n "$VZDUMP" ]; then
    NEWID=$(find_free_id) || NEWID=""
    if [ -z "$NEWID" ]; then
      log "No free VMID available in ${RANGE_START}..${RANGE_END}; cannot restore ${vmid}"
      continue
    fi
    log "Found vzdump for ${vmid}: ${VZDUMP}. Will restore into VMID ${NEWID}."

    if [ "$DRY_RUN" -eq 1 ]; then
      log "DRY-RUN: pct restore ${NEWID} ${VZDUMP} --storage local"
      continue
    fi

    log "Restoring ${VZDUMP} -> ${NEWID}"
    pct restore "$NEWID" "$VZDUMP" --storage local >> "$LOG" 2>&1 || { log "pct restore failed for ${NEWID}"; continue; }
    log "Restore completed for ${NEWID}; attempting to start"
    pct start "$NEWID" >> "$LOG" 2>&1 || log "pct start reported non-zero for ${NEWID}"
    sleep 3
    pct exec "$NEWID" -- bash -lc "echo root:violin | chpasswd" >> "$LOG" 2>&1 || true
    pct exec "$NEWID" -- bash -lc "apt-get update -y || true" >> "$LOG" 2>&1 || true
    vzdump "$NEWID" --dumpdir /var/lib/vz/dump --compress lzo --mode stop >> "$LOG" 2>&1 || log "vzdump of restored ${NEWID} failed"
    log "Restore + postchecks finished for ${NEWID}"
  else
    log "No vzdump found for ${vmid}. Will create a replacement from template ${TEMPLATE}"
    NEWID=$(find_free_id) || NEWID=""
    if [ -z "$NEWID" ]; then
      log "No free VMID available in ${RANGE_START}..${RANGE_END}; cannot create replacement for ${vmid}"
      continue
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
      log "DRY-RUN: pct create ${NEWID} ${TEMPLATE} --hostname repl-${vmid} --rootfs local:10 --cores 2 --memory 2048 --unprivileged 1"
      continue
    fi

    log "Creating replacement container ${NEWID} from template"
    pct create "$NEWID" "$TEMPLATE" \
      --hostname "repl-${vmid}" \
      --rootfs local:10 \
      --cores 2 --memory 2048 --swap 512 \
      --net0 name=eth0,bridge=google,ip=dhcp,type=veth \
      --unprivileged 1 --onboot 0 >> "$LOG" 2>&1 || { log "pct create failed for ${NEWID}"; continue; }

    pct set "$NEWID" --features nesting=1,keyctl=1,fuse=1 >> "$LOG" 2>&1 || true
    pct start "$NEWID" >> "$LOG" 2>&1 || log "pct start reported non-zero for ${NEWID}"
    sleep 4
    pct exec "$NEWID" -- bash -lc "echo root:violin | chpasswd" >> "$LOG" 2>&1 || true
    pct exec "$NEWID" -- bash -lc "apt-get update -y || true" >> "$LOG" 2>&1 || true
    vzdump "$NEWID" --dumpdir /var/lib/vz/dump --compress lzo --mode stop >> "$LOG" 2>&1 || log "vzdump of new ${NEWID} failed"
    log "Replacement ${NEWID} created and backed up for original ${vmid}"
  fi
done

log "All processing finished"
exit 0
