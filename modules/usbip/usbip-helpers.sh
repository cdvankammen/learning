#!/usr/bin/env bash
# modules/usbip/usbip-helpers.sh — wrappers around the usbip CLI
# Provides list, bind, unbind, and status functions for USB/IP device management.
set -euo pipefail

USBIP_BIN="${USBIP_BIN:-usbip}"
USBIPD_BIN="${USBIPD_BIN:-usbipd}"

_require_usbip() {
  if ! command -v "$USBIP_BIN" >/dev/null 2>&1; then
    echo "ERROR: $USBIP_BIN not found in PATH" >&2
    return 1
  fi
}

# List locally available USB devices
usbip_list_local() {
  _require_usbip || return 1
  "$USBIP_BIN" list -l 2>/dev/null
}

# List devices exported by a remote host
usbip_list_remote() {
  local host="${1:?Usage: usbip_list_remote <host>}"
  _require_usbip || return 1
  "$USBIP_BIN" list -r "$host" 2>/dev/null
}

# Bind a local device for export (server side)
usbip_bind() {
  local busid="${1:?Usage: usbip_bind <busid>}"
  _require_usbip || return 1
  echo "Binding device $busid for USB/IP export..."
  "$USBIP_BIN" bind -b "$busid"
}

# Unbind a previously bound device (server side)
usbip_unbind() {
  local busid="${1:?Usage: usbip_unbind <busid>}"
  _require_usbip || return 1
  echo "Unbinding device $busid..."
  "$USBIP_BIN" unbind -b "$busid"
}

# Connect to a remote USB device (client side)
usbip_connect() {
  local host="${1:?Usage: usbip_connect <host> <busid>}"
  local busid="${2:?Usage: usbip_connect <host> <busid>}"
  _require_usbip || return 1
  echo "Connecting to $host device $busid..."
  "$USBIP_BIN" attach -r "$host" -b "$busid"
}

# Disconnect a remote USB device (client side)
usbip_disconnect() {
  local port="${1:?Usage: usbip_disconnect <port>}"
  _require_usbip || return 1
  echo "Disconnecting port $port..."
  "$USBIP_BIN" detach -p "$port"
}

# Show currently imported (attached) devices
usbip_port_status() {
  _require_usbip || return 1
  "$USBIP_BIN" port 2>/dev/null
}

# Start the usbipd daemon (server side)
usbipd_start() {
  if ! command -v "$USBIPD_BIN" >/dev/null 2>&1; then
    echo "ERROR: $USBIPD_BIN not found" >&2
    return 1
  fi
  echo "Starting usbipd daemon..."
  "$USBIPD_BIN" -D
}

# JSON output of local devices (for API consumption)
usbip_list_local_json() {
  _require_usbip || return 1
  local devices
  devices=$("$USBIP_BIN" list -l 2>/dev/null | awk '
    /^ *-/ { next }
    /busid/ {
      gsub(/^[ \t]+/,"",$0)
      split($0, a, " ")
      busid=a[2]
      desc=""
      for(i=3;i<=NF;i++) desc=desc" "a[i]
      gsub(/^ /,"",desc)
      printf "{\"busid\":\"%s\",\"description\":\"%s\"},", busid, desc
    }
  ')
  # Wrap in JSON array
  echo "[${devices%,}]"
}
