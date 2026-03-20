#!/usr/bin/env bash
set -euo pipefail

# Prepares a local directory and helper scripts for installing a GitHub self-hosted runner.
# This script does NOT register the runner (requires token). It downloads the runner binary and
# writes a small registration helper to /usbip/session-files/runner-register.sh.

OUTDIR=/opt/actions-runner
NAME="usbip-runner"
REPO_URL=""

usage(){
  cat <<EOF
Usage: $0 --url REPO_OR_ORG_URL [--name RUNNER_NAME] [--outdir DIR]

Example: $0 --url https://github.com/yourorg/yourrepo --name usbip-runner

This will download the runner binary to $OUTDIR and create a helper script to register the runner with a token you supply.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) REPO_URL="$2"; shift 2;;
    --name) NAME="$2"; shift 2;;
    --outdir) OUTDIR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg $1"; usage; exit 1;;
  esac
done

if [[ -z "$REPO_URL" ]]; then
  echo "--url is required"; usage; exit 1
fi

mkdir -p "$OUTDIR"
mkdir -p /usbip/session-files
cd "$OUTDIR"

ARCHIVE_URL="https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz"

echo "Downloading runner binary (may redirect) to $OUTDIR" > /usbip/session-files/runner-setup.log
if command -v curl >/dev/null 2>&1; then
  curl -sSL "$ARCHIVE_URL" -o actions-runner.tar.gz >> /usbip/session-files/runner-setup.log 2>&1
elif command -v wget >/dev/null 2>&1; then
  wget -qO actions-runner.tar.gz "$ARCHIVE_URL" >> /usbip/session-files/runner-setup.log 2>&1
else
  echo "curl/wget not available; download manually: $ARCHIVE_URL" >> /usbip/session-files/runner-setup.log
fi

if [ -f actions-runner.tar.gz ]; then
  tar xzf actions-runner.tar.gz
  echo "Extracted runner to $OUTDIR" >> /usbip/session-files/runner-setup.log
fi

# Write helper registration script (requires user-provided token)
cat > /usbip/session-files/runner-register.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "This helper must be run as root; use sudo."
  exit 1
fi
if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  echo "Usage: $0 <repo_url> <token> [runner_name]"
  exit 1
fi
REPO_URL="$1"
TOKEN="$2"
RUNNER_NAME="${3:-usbip-runner}"
RUNNER_DIR="__RUNNER_DIR__"
if [[ ! -d "$RUNNER_DIR" ]]; then
  echo "Runner dir $RUNNER_DIR not found"
  exit 1
fi
cd "$RUNNER_DIR"
./config.sh --url "$REPO_URL" --token "$TOKEN" --name "$RUNNER_NAME" --labels self-hosted,proxmox --unattended
EOF
SAFE_OUTDIR=${OUTDIR//&/\\&}
SAFE_OUTDIR=${SAFE_OUTDIR//|/\\|}
sed -i "s|__RUNNER_DIR__|$SAFE_OUTDIR|g" /usbip/session-files/runner-register.sh
chmod +x /usbip/session-files/runner-register.sh

echo "Prepared runner directory at $OUTDIR and helper script at /usbip/session-files/runner-register.sh" >> /usbip/session-files/runner-setup.log

echo "To register the runner, run: sudo /usbip/session-files/runner-register.sh '$REPO_URL' <TOKEN> '$NAME'" >> /usbip/session-files/runner-setup.log
