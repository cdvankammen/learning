#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
}

@test "bash completion suggests top-level commands" {
  run bash -lc '
    source "$1/completions/usbip-ctl.bash"
    COMP_WORDS=(usbip-ctl b)
    COMP_CWORD=1
    COMPREPLY=()
    _usbip_ctl
    printf "%s\n" "${COMPREPLY[@]}"
  ' bash "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '^backups$'
  echo "$output" | grep -q '^bind$'
  echo "$output" | grep -q '^build$'
}

@test "bash completion suggests service subcommands" {
  run bash -lc '
    source "$1/completions/usbip-ctl.bash"
    COMP_WORDS=(usbip-ctl service r)
    COMP_CWORD=2
    COMPREPLY=()
    _usbip_ctl
    printf "%s\n" "${COMPREPLY[@]}"
  ' bash "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '^restart$'
}
