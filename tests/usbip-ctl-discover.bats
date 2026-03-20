#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
  DISCOVERY_PORT="${DISCOVERY_PORT:-39777}"
  export DISCOVERY_PORT
  DISCOVERY_PORT="$DISCOVERY_PORT" node -e "
const http = require('http');
const payload = JSON.stringify({
  scannedAt: new Date().toISOString(),
  peerCount: 1,
  providers: [
    { id: 'mdns', label: 'mDNS / Bonjour', peerCount: 1, candidateCount: 1, available: true, reason: null },
    { id: 'subnet-scan', label: 'Subnet scan', peerCount: 0, candidateCount: 0, available: true, reason: null }
  ],
  peers: [
    { hostname: 'node-a.local', baseUrl: 'http://192.168.1.25:3001', source: 'mdns', subnet: '192.168.1.0/24' }
  ]
});
const server = http.createServer((req, res) => {
  if (req.url === '/api/discovery/peers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(payload);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});
server.listen(process.env.DISCOVERY_PORT, '127.0.0.1');
" &
  SERVER_PID=$!
  sleep 1
}

teardown() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

@test "discover prints discovery report" {
  run env API_URL="http://127.0.0.1:${DISCOVERY_PORT}" bash "$REPO_ROOT/bin/usbip-ctl" discover
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Discovery Report"
  echo "$output" | grep -q "mDNS / Bonjour"
  echo "$output" | grep -q "node-a.local"
}

@test "discover announce reports when stopped" {
  run env USBIP_MDNS_PID_FILE="$BATS_TEST_TMPDIR/usbip-mdns.pid" bash "$REPO_ROOT/bin/usbip-ctl" discover announce status
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Not running"
}
