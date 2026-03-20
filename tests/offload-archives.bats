#!/usr/bin/env bats
# tests/offload-archives.bats — tests for offload-archives.sh

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
  export TMPDIR
  TMPDIR="$(mktemp -d)"
  export DUMP_DIR="$TMPDIR/dump"
  mkdir -p "$DUMP_DIR" "$TMPDIR/bin"
  export LOG="$TMPDIR/offload.log"
  : > "$LOG"
  export DAYS=1
  export DRY_RUN=0
  export DELETE_AFTER_COPY=1
  export RCLONE_DEST="remote:backups"
  export RCLONE_CALLS="$TMPDIR/rclone.calls"
  : > "$RCLONE_CALLS"
  export PATH="$TMPDIR/bin:$PATH"

  cat > "$TMPDIR/bin/rclone" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$RCLONE_CALLS"
exit 0
SH
  chmod +x "$TMPDIR/bin/rclone"
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "rclone offload copies to the configured destination" {
  archive="$DUMP_DIR/vzdump-lxc-101-2026_03_18_00_00_00.tar.lzo"
  echo "archive" > "$archive"
  touch -d "2 days ago" "$archive"

  run "$REPO_ROOT/tools/offload-archives.sh"
  [ "$status" -eq 0 ]

  grep -q "Uploaded" "$LOG"
  grep -q "remote:backups/vzdump-lxc-101-2026_03_18_00_00_00.tar.lzo" "$LOG"
  grep -q "copyto" "$RCLONE_CALLS"
  [ ! -e "$archive" ]
}
