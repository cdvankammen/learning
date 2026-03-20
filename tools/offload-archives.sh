#!/usr/bin/env bash
set -euo pipefail

LOG="${LOG:-/usbip/session-files/offload-archives.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
DUMP_DIR="${DUMP_DIR:-/var/lib/vz/dump}"
DAYS="${DAYS:-30}"
DRY_RUN="${DRY_RUN:-1}"
DELETE_AFTER_COPY="${DELETE_AFTER_COPY:-0}"
BUCKET="${BUCKET:-}"
AWS_PROFILE="${AWS_PROFILE:-}"
ENDPOINT="${ENDPOINT:-}"
RCLONE_DEST="${RCLONE_DEST:-}"

usage(){
  cat <<EOF
Usage: $0 --bucket BUCKET [--days N] [--dry-run|--exec] [--delete-after-copy] [--profile PROFILE] [--endpoint URL] [--rclone-dest DEST]

Defaults: --dry-run (no upload). To perform uploads pass --exec.
Use --rclone-dest to offload with rclone instead of awscli.
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
    --rclone-dest) RCLONE_DEST="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

echo "offload run at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
[ -d "$DUMP_DIR" ] || { echo "DUMP_DIR $DUMP_DIR missing" >> "$LOG"; exit 1; }
if [[ $DRY_RUN -eq 0 && -z "$BUCKET" && -z "$RCLONE_DEST" ]]; then
  echo "No destination specified for exec mode. Provide --bucket BUCKET or --rclone-dest DEST" >> "$LOG"
  exit 1
fi

mapfile -t files < <(find "$DUMP_DIR" -maxdepth 1 -type f \( -name 'vzdump-lxc-*.tar.*' -o -name 'filebackup-*-rootfs-*.tar.xz' \) -not -name '*.notes' -not -name '*.protected' -mtime +"$DAYS" -print)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No candidate files older than $DAYS days" >> "$LOG"
  exit 0
fi

for f in "${files[@]}"; do
  base=$(basename "$f")
  if [[ $DRY_RUN -eq 1 ]]; then
    if [[ -n "$RCLONE_DEST" ]]; then
      echo "DRY-RUN: would copy $f -> ${RCLONE_DEST%/}/$base" >> "$LOG"
    else
      echo "DRY-RUN: would copy $f -> s3://$BUCKET/$base" >> "$LOG"
    fi
    continue
  fi

  if [[ -n "$RCLONE_DEST" ]]; then
    dest="${RCLONE_DEST%/}/$base"
    echo "Uploading $f -> $dest" >> "$LOG"
    if command -v rclone >/dev/null 2>&1; then
      rclone copyto "$f" "$dest" >>"$LOG" 2>&1 || { echo "ERROR: rclone copyto failed for $f" >>"$LOG"; continue; }
      echo "Uploaded $f -> $dest" >> "$LOG"
      if [[ $DELETE_AFTER_COPY -eq 1 ]]; then
        rm -f "$f"
        echo "Deleted local $f after copy" >> "$LOG"
      fi
    else
      echo "ERROR: rclone not found. Install rclone or use awscli." >> "$LOG"
    fi
  else
    echo "Uploading $f -> s3://$BUCKET/$base" >> "$LOG"
    if command -v aws >/dev/null 2>&1; then
      aws s3 cp "$f" "s3://${BUCKET}/${base}" ${AWS_PROFILE:+--profile $AWS_PROFILE} ${ENDPOINT:+--endpoint-url $ENDPOINT} >>"$LOG" 2>&1 || { echo "ERROR: aws s3 cp failed for $f" >>"$LOG"; continue; }
      echo "Uploaded $f -> s3://$BUCKET/$base" >> "$LOG"
      if [[ $DELETE_AFTER_COPY -eq 1 ]]; then
        rm -f "$f"
        echo "Deleted local $f after copy" >> "$LOG"
      fi
    else
      echo "ERROR: aws CLI not found. Install awscli or pass --rclone-dest with rclone installed." >> "$LOG"
    fi
  fi
done

echo "offload finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
