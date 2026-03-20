#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
}

@test "help lists service controls" {
  run bash "$REPO_ROOT/bin/usbip-ctl" help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "up"
  echo "$output" | grep -q "service"
}

@test "up routes to the service manager" {
  run env USBIP_SERVICE_MANAGER=echo bash "$REPO_ROOT/bin/usbip-ctl" up
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "start usbip-web"
  echo "$output" | grep -q "service started"
}

@test "service status routes to the service manager" {
  run env USBIP_SERVICE_MANAGER=echo bash "$REPO_ROOT/bin/usbip-ctl" service status
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "status usbip-web"
}
