#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
  JSON_PORT="${JSON_PORT:-39778}"
  export JSON_PORT
  JSON_PORT="$JSON_PORT" node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: 'test', uptime: 1, components: {} }));
    return;
  }
  if (req.url === '/api/system') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hostname: 'node-a', cpus: 8, loadavg: [0.1, 0.2, 0.3], mem: { total: 1024, free: 512 }, uptime: 3600 }));
    return;
  }
  if (req.url === '/api/discovery/peers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ scannedAt: new Date().toISOString(), peerCount: 1, providers: [], peers: [{ hostname: 'node-a.local', baseUrl: 'http://192.168.1.25:3001', source: 'mdns', subnet: '192.168.1.0/24' }] }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});
server.listen(process.env.JSON_PORT, '127.0.0.1');
" &
  SERVER_PID=$!
  sleep 1
}

teardown() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

@test "status --json emits combined machine-readable output" {
  run env API_URL="http://127.0.0.1:${JSON_PORT}" bash "$REPO_ROOT/bin/usbip-ctl" --json status
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["health"]["status"] == "ok"; assert d["system"]["hostname"] == "node-a"'
}

@test "discover --json emits the raw discovery payload" {
  run env API_URL="http://127.0.0.1:${JSON_PORT}" bash "$REPO_ROOT/bin/usbip-ctl" --json discover
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["peerCount"] == 1; assert d["peers"][0]["hostname"] == "node-a.local"'
}
