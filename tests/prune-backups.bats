#!/usr/bin/env bats
# tests/prune-backups.bats — unit tests for prune-backups.sh

setup() {
  export TMPDIR
  TMPDIR="$(mktemp -d)"
  DUMP="$TMPDIR/dump"
  mkdir -p "$DUMP"
  # Create fake archives with staggered mtimes
  for i in $(seq 1 5); do
    f="$DUMP/vzdump-lxc-100-2026_03_${i}_00_00_00.tar.lzo"
    touch -d "2026-03-${i}T00:00:00" "$f"
  done
  for i in $(seq 1 3); do
    f="$DUMP/filebackup-200-rootfs-2026_03_${i}_00_00_00.tar.xz"
    touch -d "2026-03-${i}T00:00:00" "$f"
  done
  # Point the script at our temp dump dir
  export DUMP_DIR="$DUMP"
  export LOG="$TMPDIR/prune.log"
}

teardown() {
  rm -rf "$TMPDIR"
}

# Helper: run prune with overridden DUMP_DIR and LOG
run_prune() {
  # We source the script logic by running it after injecting env vars
  # Since the script reads DUMP_DIR and LOG from its own variables,
  # we need to patch it. We'll use a wrapper.
  cat > "$TMPDIR/run.sh" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
WRAPPER
  # Append the script but override DUMP_DIR and LOG
  {
    echo "LOG=\"$LOG\""
    echo "DUMP_DIR=\"$DUMP_DIR\""
    sed '1d; /^LOG=/d; /^DUMP_DIR=/d' /usbip/repo/modules/backup/prune-backups.sh
  } >> "$TMPDIR/run.sh"
  chmod +x "$TMPDIR/run.sh"
  "$TMPDIR/run.sh" "$@"
}

@test "dry-run keeps all files" {
  run run_prune -n -k 2
  [ "$status" -eq 0 ]
  # All 5 vzdump + 3 filebackup should still exist
  count=$(find "$DUMP" -type f | wc -l)
  [ "$count" -eq 8 ]
}

@test "dry-run log mentions DRY-RUN" {
  run_prune -n -k 2
  grep -q "DRY-RUN" "$LOG"
}

@test "prune removes excess vzdump files keeping 2" {
  run_prune -k 2
  vzdump_count=$(find "$DUMP" -name 'vzdump-lxc-*.tar.lzo' -type f | wc -l)
  [ "$vzdump_count" -eq 2 ]
}

@test "prune removes excess filebackup files keeping 1" {
  run_prune -k 1
  fb_count=$(find "$DUMP" -name 'filebackup-*-rootfs-*.tar.xz' -type f | wc -l)
  [ "$fb_count" -eq 1 ]
}

@test "prune does nothing when count <= keep" {
  run_prune -k 10
  count=$(find "$DUMP" -type f | wc -l)
  [ "$count" -eq 8 ]
}

@test "prune with keep=0 removes all" {
  run_prune -k 0
  count=$(find "$DUMP" -type f | wc -l)
  [ "$count" -eq 0 ]
}
