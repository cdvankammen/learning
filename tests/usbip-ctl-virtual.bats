#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
}

@test "virtual help lists bridge controls" {
  run bash "$REPO_ROOT/bin/usbip-ctl" virtual help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "virtual <status|list|start|stop|restart>"
}
