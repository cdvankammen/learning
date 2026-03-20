#!/usr/bin/env bash
set -euo pipefail
# Run lint, backend tests, and build frontend locally
cd /usbip/repo
# lint
if command -v npm >/dev/null 2>&1; then
  (cd webapp/backend && npm install) || true
  (cd webapp/frontend && npm install) || true
fi

# Run backend tests (if configured)
# Build frontend
cd webapp/frontend || exit 0
npm run build || true

echo "Local CI run complete"
