#!/usr/bin/env bash
set -euo pipefail

LOG=/usbip/session-files/offload-archives.log
DUMP_DIR=/var/lib/vz/dump
DAYS=30
DRY_RUN=1
DELETE_AFTER_COPY=0
BUCKET=""
AWS_PROFILE=""
ENDPOINT=""

usage(){
  cat <<EOF
Usage: $0 --bucket BUCKET [--days N] [--dry-run|--exec] [--delete-after-copy] [--profile PROFILE] [--endpoint URL]

Defaults: --dry-run (no upload). To perform uploads pass --exec.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bucket) BUCKET="$2"; shift 2;;
    --days) DAYS="$2"; shift 2;;
    --exec|--run) DRY_RUN=0; shift;;
    --dry-run) DRY_RUN=1; shift;;
    --delete-after-copy) DELETE_AFTER_COPY=1; shift;;
    --profile) AWS_PROFILE="$2"; shift 2;;
    --endpoint) ENDPOINT="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

echo "offload run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
[ -d "$DUMP_DIR" ] || { echo "DUMP_DIR $DUMP_DIR missing" >> "$LOG"; exit 1; }
if [[ $DRY_RUN -eq 0 && -z "$BUCKET" ]]; then echo "No bucket specified for exec mode. Provide --bucket BUCKET" >> "$LOG"; exit 1; fi

mapfile -t files < <(find "$DUMP_DIR" -maxdepth 1 -type f \( -name 'vzdump-lxc-*.tar.*' -o -name 'filebackup-*-rootfs-*.tar.xz' \) -not -name '*.notes' -not -name '*.protected' -mtime +"$DAYS" -print)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No candidate files older than $DAYS days" >> "$LOG"
  exit 0
fi

for f in "${files[@]}"; do
  base=$(basename "$f")
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN: would copy $f -> s3://$BUCKET/$base" >> "$LOG"
    continue
  fi

  echo "Uploading $f -> s3://$BUCKET/$base" >> "$LOG"
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "$f" "s3://${BUCKET}/${base}" ${AWS_PROFILE:+--profile $AWS_PROFILE} ${ENDPOINT:+--endpoint-url $ENDPOINT} >>"$LOG" 2>&1 || { echo "ERROR: aws s3 cp failed for $f" >>"$LOG"; continue; }
    echo "Uploaded $f -> s3://$BUCKET/$base" >> "$LOG"
    if [[ $DELETE_AFTER_COPY -eq 1 ]]; then
      rm -f "$f"
      echo "Deleted local $f after copy" >> "$LOG"
    fi
  else
    echo "ERROR: aws CLI not found. Install awscli or use rclone (not implemented)." >> "$LOG"
  fi
done

echo "offload finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
