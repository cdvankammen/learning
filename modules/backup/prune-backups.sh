#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/prune-backups.log
DRY_RUN=0
KEEP=10
DUMP_DIR=/var/lib/vz/dump
PATTERNS=("vzdump-lxc-*.tar.lzo" "filebackup-*-rootfs-*.tar.xz")

usage(){
  cat <<EOF
Usage: $0 [-n|--dry-run] [-k KEEP]
  -n, --dry-run   Show what would be removed
  -k, --keep      Number of recent files to keep per pattern (default: $KEEP)
EOF
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1; shift ;;
    -k|--keep) KEEP="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

log(){ echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

if [ ! -d "$DUMP_DIR" ]; then
  log "Dump dir $DUMP_DIR not found, nothing to do"
  exit 0
fi

for pat in "${PATTERNS[@]}"; do
  log "Processing pattern $pat (keep=$KEEP)"
  # collect files sorted by mtime (newest first)
  # shellcheck disable=SC2086 # intentional glob expansion for pattern variable
  mapfile -t files < <(find "$DUMP_DIR" -maxdepth 1 -type f -name "$pat" -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed 's/^[0-9.]* //')
  count=${#files[@]}
  if [ "$count" -le "$KEEP" ]; then
    log "No files to prune for pattern $pat (found $count)"
    continue
  fi

  for ((i=KEEP;i<count;i++)); do
    f="${files[$i]}"
    [ -z "$f" ] && continue
    [ ! -e "$f" ] && continue
    if [ "$DRY_RUN" -eq 1 ]; then
      log "DRY-RUN: would remove $f"
    else
      if rm -f -- "$f"; then
        log "Removed $f"
      else
        log "Failed to remove $f"
      fi
    fi
  done
done

log "Prune run completed"
exit 0
