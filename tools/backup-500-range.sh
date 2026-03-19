#!/bin/bash
set -euo pipefail

LOGDIR=/usbip/session-files/backups
mkdir -p "$LOGDIR"

# gather VMIDs 500..999
/usr/bin/pct list | awk 'NR>1 && $1 >= 500 && $1 <= 999 {print $1}' > /tmp/usbip-vmids-500.txt || true

while read -r vmid; do
  if [ -z "$vmid" ]; then
    continue
  fi
  recent=$(find /var/lib/vz/dump -maxdepth 1 -type f -name "*${vmid}*" -mmin -240 -print -quit 2>/dev/null || true)
  if [ -n "$recent" ]; then
    echo "Recent backup exists for $vmid: $recent" >> "$LOGDIR/backup-run.log"
    continue
  fi
  status=$(pct status "$vmid" 2>/dev/null || echo "missing")
  echo "Processing $vmid - status: $status" >> "$LOGDIR/backup-run.log"
  if echo "$status" | grep -q "running"; then
    vzdump "$vmid" --dumpdir /var/lib/vz/dump --compress lzo --mode snapshot >> "$LOGDIR/vzdump-${vmid}.log" 2>&1 || echo "vzdump snapshot failed for $vmid" >> "$LOGDIR/vzdump-${vmid}.log"
  else
    vzdump "$vmid" --dumpdir /var/lib/vz/dump --compress lzo --mode stop >> "$LOGDIR/vzdump-${vmid}.log" 2>&1 || echo "vzdump stop failed for $vmid" >> "$LOGDIR/vzdump-${vmid}.log"
  fi
done < /tmp/usbip-vmids-500.txt

echo "Backup run finished at $(date -u)" >> "$LOGDIR/backup-run.log"
