#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
}

@test "install-usbip-lxc dry-run prints a full bootstrap plan" {
  run env DRY_RUN=1 bash "$REPO_ROOT/modules/lxc-provision/install-usbip-lxc.sh" \
    --vmid 612 \
    --hostname usbip-test \
    --template local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
    --repo-url https://example.com/usbip.git \
    --branch main \
    --install-dir /opt/usbip \
    --config-dir /var/lib/usbip-web \
    --with-usbip

  [ "$status" -eq 0 ]
  [[ "$output" == *'DRY-RUN: pct create 612 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst --hostname usbip-test'* ]]
  [[ "$output" == *'--features nesting=1,keyctl=1'* ]]
  [[ "$output" == *'DRY-RUN: the container will also install usbip and usbutils packages'* ]]
  [[ "$output" == *'enable usbip-web'* ]]
}
