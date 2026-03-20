#!/usr/bin/env bats
# tests/restore-or-replace.bats — dry-run tests for restore-or-replace.sh

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
  export TMPDIR
  TMPDIR="$(mktemp -d)"
  DUMP="$TMPDIR/dump"
  CONF="$TMPDIR/pve-lxc"
  mkdir -p "$DUMP" "$CONF"
  export LOG="$TMPDIR/restore.log"
  touch "$LOG"
}

teardown() {
  rm -rf "$TMPDIR"
}

# We can only test dry-run since pct isn't available in test env
run_restore_dry() {
  cat > "$TMPDIR/rr.sh" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
WRAPPER
  {
    echo "LOG=\"$LOG\""
    # Override the /etc/pve/lxc path check by patching the conf directory
    sed '1d; /^LOG=/d' "$REPO_ROOT/modules/lxc-restore/restore-or-replace.sh" |
      sed "s|/etc/pve/lxc|$CONF|g" |
      sed "s|/var/lib/vz/dump|$DUMP|g"
  } >> "$TMPDIR/rr.sh"
  chmod +x "$TMPDIR/rr.sh"
  "$TMPDIR/rr.sh" "$@"
}

@test "dry-run skips existing VMIDs" {
  # Create fake conf files to simulate existing CTs
  touch "$CONF/300.conf" "$CONF/420.conf"
  run run_restore_dry -n --vmids 300,420
  [ "$status" -eq 0 ]
  grep -q "already exists" "$LOG"
}

@test "dry-run logs restore intent when archive exists" {
  # VMID 300 missing but archive present
  touch "$DUMP/vzdump-lxc-300-2026_03_20.tar.lzo"
  # Need free IDs in 500-599
  run run_restore_dry -n --vmids 300
  [ "$status" -eq 0 ]
  grep -q "DRY-RUN" "$LOG"
}

@test "dry-run logs replacement when no archive exists" {
  # VMID 300 missing, no archive
  run run_restore_dry -n --vmids 300
  [ "$status" -eq 0 ]
  grep -q "replacement\|DRY-RUN" "$LOG"
}
