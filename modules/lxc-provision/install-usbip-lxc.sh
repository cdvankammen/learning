#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${USBIP_REPO_ROOT:-}" ]; then
  REPO_ROOT="$USBIP_REPO_ROOT"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

VMID=""
HOSTNAME="${USBIP_LXC_HOSTNAME:-usbip-web}"
MEMORY="${USBIP_LXC_MEMORY:-2048}"
CORES="${USBIP_LXC_CORES:-2}"
DISK="${USBIP_LXC_DISK:-12}"
BRIDGE="${USBIP_LXC_BRIDGE:-vmbr0}"
STORAGE="${USBIP_LXC_STORAGE:-local-lvm}"
TEMPLATE="${USBIP_LXC_TEMPLATE:-}"
INSTALL_DIR="${USBIP_LXC_INSTALL_DIR:-/opt/usbip}"
CONFIG_DIR="${USBIP_LXC_CONFIG_DIR:-/var/lib/usbip-web}"
REPO_URL="${USBIP_LXC_REPO_URL:-}"
BRANCH="${USBIP_LXC_BRANCH:-main}"
PASSWORD="${USBIP_LXC_PASSWORD:-}"
WITH_USBIP="${USBIP_LXC_WITH_USBIP:-0}"
DRY_RUN="${DRY_RUN:-0}"

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --vmid ID              Container ID to create
  --hostname NAME        Container hostname (default: $HOSTNAME)
  --memory MB            Memory in MB (default: $MEMORY)
  --cores N              CPU cores (default: $CORES)
  --disk GB              Root disk size in GB (default: $DISK)
  --bridge BRIDGE        Proxmox bridge name (default: $BRIDGE)
  --storage POOL         Proxmox storage pool (default: $STORAGE)
  --template PATH        LXC template path to use
  --install-dir PATH     Repo checkout path inside the container (default: $INSTALL_DIR)
  --config-dir PATH      Config directory inside the container (default: $CONFIG_DIR)
  --repo-url URL         Git repository URL to clone inside the container
  --branch NAME          Git branch to deploy (default: $BRANCH)
  --password VALUE       Root password for the new container
  --with-usbip           Install usbip/usbutils packages in the container
  --dry-run              Print the actions without changing anything
  -h, --help             Show this help

Environment overrides:
  USBIP_REPO_ROOT, USBIP_LXC_*, DRY_RUN
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'DRY-RUN:' 
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

allocate_vmid() {
  if [ -n "$VMID" ]; then
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    VMID="777"
    return
  fi

  for candidate in $(seq 500 999); do
    if ! pct status "$candidate" >/dev/null 2>&1 && [ ! -f "/etc/pve/lxc/$candidate.conf" ]; then
      VMID="$candidate"
      return
    fi
  done

  die "No free VMID found in 500-999"
}

resolve_template() {
  if [ -n "$TEMPLATE" ]; then
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    TEMPLATE="<auto-detect from local Debian/Ubuntu templates>"
    return
  fi

  local candidate
  for pattern in \
    '*debian-12-standard*.tar.zst' \
    '*ubuntu-24.04-standard*.tar.zst' \
    '*ubuntu-22.04-standard*.tar.zst'
  do
    candidate="$(find /var/lib/vz/template/cache -maxdepth 1 -type f -name "$pattern" | sort -V | tail -n 1 || true)"
    if [ -n "$candidate" ]; then
      TEMPLATE="$candidate"
      return
    fi
  done

  die "No cached Debian or Ubuntu template found under /var/lib/vz/template/cache"
}

resolve_repo_url() {
  if [ -n "$REPO_URL" ]; then
    return
  fi

  if git -C "$REPO_ROOT" remote get-url origin >/dev/null 2>&1; then
    REPO_URL="$(git -C "$REPO_ROOT" remote get-url origin)"
    return
  fi

  die "Set --repo-url or configure an origin remote for $REPO_ROOT"
}

generate_password() {
  if [ -n "$PASSWORD" ]; then
    return
  fi

  PASSWORD="usbip-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
}

bootstrap_script() {
  cat <<EOF
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="\$1"
CONFIG_DIR="\$2"
REPO_URL="\$3"
BRANCH="\$4"
WITH_USBIP="\$5"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git nodejs npm
if [ "\$WITH_USBIP" = "1" ]; then
  apt-get install -y usbip usbutils
fi

install -d -m 0755 "\$INSTALL_DIR" "\$CONFIG_DIR"

if [ -d "\$INSTALL_DIR/.git" ]; then
  git -C "\$INSTALL_DIR" fetch --all --prune
  git -C "\$INSTALL_DIR" checkout "\$BRANCH"
  git -C "\$INSTALL_DIR" pull --ff-only
else
  git clone --branch "\$BRANCH" "\$REPO_URL" "\$INSTALL_DIR"
fi

cd "\$INSTALL_DIR/webapp/frontend"
npm ci --no-audit --no-fund
npm run build

cd "\$INSTALL_DIR/webapp/backend"
npm ci --no-audit --no-fund

cat > /etc/systemd/system/usbip-web.service <<'UNIT'
[Unit]
Description=USB/IP Web Platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=__INSTALL_DIR__/webapp/backend
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=USBIP_BIND_HOST=0.0.0.0
Environment=USBIP_CONFIG_DIR=__CONFIG_DIR__
ExecStart=/usr/bin/node __INSTALL_DIR__/webapp/backend/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sed -i \
  -e "s|__INSTALL_DIR__|\$INSTALL_DIR|g" \
  -e "s|__CONFIG_DIR__|\$CONFIG_DIR|g" \
  /etc/systemd/system/usbip-web.service

systemctl daemon-reload
systemctl enable --now usbip-web
EOF
}

VMID="${VMID:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --vmid)
      VMID="${2:?--vmid requires a value}"
      shift 2
      ;;
    --hostname)
      HOSTNAME="${2:?--hostname requires a value}"
      shift 2
      ;;
    --memory)
      MEMORY="${2:?--memory requires a value}"
      shift 2
      ;;
    --cores)
      CORES="${2:?--cores requires a value}"
      shift 2
      ;;
    --disk)
      DISK="${2:?--disk requires a value}"
      shift 2
      ;;
    --bridge)
      BRIDGE="${2:?--bridge requires a value}"
      shift 2
      ;;
    --storage)
      STORAGE="${2:?--storage requires a value}"
      shift 2
      ;;
    --template)
      TEMPLATE="${2:?--template requires a value}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:?--install-dir requires a value}"
      shift 2
      ;;
    --config-dir)
      CONFIG_DIR="${2:?--config-dir requires a value}"
      shift 2
      ;;
    --repo-url)
      REPO_URL="${2:?--repo-url requires a value}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:?--branch requires a value}"
      shift 2
      ;;
    --password)
      PASSWORD="${2:?--password requires a value}"
      shift 2
      ;;
    --with-usbip)
      WITH_USBIP=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

allocate_vmid
resolve_template
resolve_repo_url
generate_password

log "Preparing USB/IP LXC bootstrap"
log "  VMID: $VMID"
log "  Hostname: $HOSTNAME"
log "  Template: $TEMPLATE"
log "  Repo: $REPO_URL ($BRANCH)"
log "  Install dir: $INSTALL_DIR"
log "  Config dir: $CONFIG_DIR"
if [ "$WITH_USBIP" -eq 1 ]; then
  log "  USB/IP packages: enabled"
else
  log "  USB/IP packages: disabled"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY-RUN: pct create $VMID $TEMPLATE --hostname $HOSTNAME --memory $MEMORY --cores $CORES --net0 name=eth0,bridge=$BRIDGE,ip=dhcp,type=veth --rootfs ${STORAGE}:${DISK} --password [redacted] --unprivileged 1 --onboot 1 --features nesting=1,keyctl=1"
  log "DRY-RUN: pct start $VMID"
  log "DRY-RUN: copy bootstrap script into the container and run it with the repo URL, branch, and install paths"
  if [ "$WITH_USBIP" -eq 1 ]; then
    log "DRY-RUN: the container will also install usbip and usbutils packages"
  fi
  log "DRY-RUN: the container will install nodejs/npm, clone the repo, build the frontend, install backend deps, and enable usbip-web"
  exit 0
fi

[ "$(id -u)" -eq 0 ] || die "Run this helper as root on the Proxmox host"
command -v pct >/dev/null 2>&1 || die "pct is required on the Proxmox host"
command -v git >/dev/null 2>&1 || die "git is required on the Proxmox host"
command -v od >/dev/null 2>&1 || die "od is required on the Proxmox host"

run pct create "$VMID" "$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --memory "$MEMORY" \
  --cores "$CORES" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp,type=veth" \
  --rootfs "${STORAGE}:${DISK}" \
  --password "$PASSWORD" \
  --unprivileged 1 \
  --onboot 1 \
  --features "nesting=1,keyctl=1"

bootstrap_file="$(mktemp)"
trap 'rm -f "$bootstrap_file"' EXIT
bootstrap_script > "$bootstrap_file"
chmod 0755 "$bootstrap_file"

run pct push "$VMID" "$bootstrap_file" /root/usbip-bootstrap.sh
run pct start "$VMID"
run pct exec "$VMID" -- bash /root/usbip-bootstrap.sh "$INSTALL_DIR" "$CONFIG_DIR" "$REPO_URL" "$BRANCH" "$WITH_USBIP"
run pct exec "$VMID" -- rm -f /root/usbip-bootstrap.sh

log "USB/IP LXC bootstrap completed for CT $VMID"
log "Use 'pct exec $VMID -- hostname -I' to find the container IP."
