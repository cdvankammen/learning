#!/usr/bin/env bats
# tests/health-check.bats — unit tests for health-check.sh

setup() {
  export TMPDIR
  TMPDIR="$(mktemp -d)"
  DUMP="$TMPDIR/dump"
  mkdir -p "$DUMP"
  export LOG="$TMPDIR/health.log"
  touch "$LOG"
}

teardown() {
  rm -rf "$TMPDIR"
}

run_health() {
  cat > "$TMPDIR/hc.sh" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
WRAPPER
  {
    echo "LOG=\"$LOG\""
    echo "DUMP_DIR=\"$DUMP\""
    sed '1d; /^LOG=/d; /^DUMP_DIR=/d' /usbip/repo/modules/monitor/health-check.sh
  } >> "$TMPDIR/hc.sh"
  chmod +x "$TMPDIR/hc.sh"
  "$TMPDIR/hc.sh"
}

@test "reports OK when recent backup exists and low disk" {
  # Create a fresh fake backup
  touch "$DUMP/vzdump-lxc-500-2026_03_20_00_00_00.tar.zst"
  run run_health
  [ "$status" -eq 0 ]
  grep -q "OK" "$LOG"
}

@test "reports NO BACKUP when dump dir empty" {
  run run_health
  [ "$status" -ne 0 ]
  grep -q "NO BACKUP" "$LOG"
}

@test "counts vzdump archives correctly" {
  for i in 1 2 3; do
    touch "$DUMP/vzdump-lxc-${i}00-2026_03_20.tar.lzo"
  done
  touch "$DUMP/vzdump-lxc-500-2026_03_20_00_00_00.tar.zst"
  run run_health
  grep -q "total vzdump archives: 4" "$LOG"
}
