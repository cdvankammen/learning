#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PLATFORM=""
TARGET=""
OUTDIR="${OUTDIR:-$REPO_ROOT/dist/releases}"
VERSION="${VERSION:-}"
BINARY_NAME="${BINARY_NAME:-usbip-backend}"

usage() {
  cat <<EOF
Usage: $0 --platform PLATFORM --target PKG_TARGET [--outdir DIR] [--version VERSION] [--binary-name NAME]

Example:
  $0 --platform linux-x64 --target linux-x64
EOF
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --outdir) OUTDIR="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --binary-name) BINARY_NAME="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

if [[ -z "$PLATFORM" || -z "$TARGET" ]]; then
  usage
fi

if [[ -z "$VERSION" ]]; then
  VERSION="$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo dev)"
fi
VERSION="${VERSION//\//-}"
VERSION="${VERSION// /-}"

FRONTEND_DIST="$REPO_ROOT/webapp/frontend/dist"
if [[ ! -d "$FRONTEND_DIST" ]]; then
  echo "Frontend dist not found at $FRONTEND_DIST. Build the frontend first." >&2
  exit 1
fi

mkdir -p "$OUTDIR"

STAGING_ROOT="$OUTDIR/staging"
STAGING_DIR="$STAGING_ROOT/usbip-${PLATFORM}"
ARCHIVE_NAME="usbip-${PLATFORM}-${VERSION}.tar.gz"
CHECKSUM_NAME="${ARCHIVE_NAME}.sha256"
BINARY_EXT=""
if [[ "$TARGET" == win-* ]]; then
  BINARY_EXT=".exe"
fi

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/frontend"

(
  cd "$REPO_ROOT/webapp/backend"
  npm ci --no-audit --no-fund 2>/dev/null || true
  ./node_modules/.bin/pkg index.js --targets "node18-${TARGET}" --output "$STAGING_DIR/${BINARY_NAME}${BINARY_EXT}"
)

cp -R "$FRONTEND_DIST" "$STAGING_DIR/frontend/dist"
cp "$REPO_ROOT/README.md" "$STAGING_DIR/README.md"
if [[ -d "$REPO_ROOT/docs" ]]; then
  cp -R "$REPO_ROOT/docs" "$STAGING_DIR/docs"
fi

(
  cd "$STAGING_ROOT"
  tar -czf "$OUTDIR/$ARCHIVE_NAME" "usbip-${PLATFORM}"
)

node - "$OUTDIR/$ARCHIVE_NAME" "$OUTDIR/$CHECKSUM_NAME" "$ARCHIVE_NAME" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const archive = process.argv[2];
const out = process.argv[3];
const name = process.argv[4];
const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(out, `${hash}  ${name}\n`);
NODE

echo "$OUTDIR/$ARCHIVE_NAME"
echo "$OUTDIR/$CHECKSUM_NAME"
