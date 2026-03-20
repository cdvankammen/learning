#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
}

@test "install-service dry-run renders repo-relative paths" {
  run env USBIP_REPO_ROOT="/opt/usbip-checkout" DRY_RUN=1 bash "$REPO_ROOT/tools/install-service.sh" --install
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "WorkingDirectory=/opt/usbip-checkout/webapp/backend"
  echo "$output" | grep -q "ExecStart=/usr/bin/node /opt/usbip-checkout/webapp/backend/index.js"
  ! echo "$output" | grep -q "/home/chris/Documents/usbip"
}
