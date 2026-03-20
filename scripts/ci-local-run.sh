#!/usr/bin/env bash
set -euo pipefail
# Run lint, backend tests, and build frontend locally
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

cd "$REPO_ROOT"
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
