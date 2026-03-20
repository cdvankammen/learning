# USB/IP Management Platform

A comprehensive platform for managing Proxmox LXC containers and USB/IP device sharing, with a modern web dashboard, automated backups, and CI/CD pipeline.

## Architecture

```
 /home/chris/Documents/usbip/
├── webapp/
│   ├── frontend/          # Vite + React SPA (Dashboard, Containers, Devices, Backups, Settings)
│   └── backend/           # Express + Socket.IO API server
├── modules/
│   ├── lxc-provision/     # LXC creation with safe defaults
│   ├── lxc-restore/       # Restore-or-replace from vzdump archives
│   ├── backup/            # Prune retention & restore validation
│   ├── monitor/           # Health-check (disk, backup age, alerts)
│   ├── network/           # Network validation for containers
│   └── usbip/            # USB/IP bind/unbind/list helpers
├── tools/
│   ├── install-cron-backups.sh    # Automated backup cron installer
│   ├── offload-archives.sh       # S3 offload (dry-run default)
│   ├── ensure-no-secrets.sh      # Secret scanning
│   ├── harden-scripts.sh         # Script hardening checks
│   ├── package-release.sh        # Cross-platform release packaging helper
│   ├── release-draft.sh          # GitHub release draft generator
│   └── push-to-remote.sh         # Git push helper (SSH/HTTPS)
├── tests/                 # BATS shell tests (prune, health, restore)
├── e2e/                   # Playwright E2E tests
├── .github/workflows/     # CI: frontend, full, E2E, release
├── scripts/               # Local CI runner
├── templates/             # Release note templates
└── Makefile               # Convenience targets
```

## Quick Start

```bash
# Install dependencies
cd webapp/backend  && npm install
cd webapp/frontend && npm install

# Build frontend
cd webapp/frontend && npm run build

# Start server (serves API + frontend on port 3001)
cd webapp/backend && node index.js
```

Open http://localhost:3001 to access the dashboard.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service health + version |
| GET | `/api/system` | Host info (hostname, CPU, memory, load) |
| GET | `/api/lxc/list` | List all LXC containers |
| GET | `/api/lxc/:id/status` | Single container status |
| GET | `/api/backups` | List vzdump backup archives |
| GET | `/api/usbip/devices` | List local USB devices |
| POST | `/api/usbip/bind` | Bind device for USB/IP export |
| POST | `/api/usbip/unbind` | Unbind device |

## Makefile Targets

```bash
make help          # Show all targets
make test          # Run BATS + Python tests
make lint          # Shellcheck + ESLint
make build         # Build frontend
make serve         # Start backend
make health-check  # Run health check
make prune         # Dry-run backup prune
make harden        # Script hardening checks
make secrets-scan  # Scan for leaked secrets
```

## Backup Policy

- **Frequency**: Every 4 hours (configurable via `tools/install-cron-backups.sh`)
- **Method**: `vzdump --mode snapshot` (fallback: `--mode stop`)
- **Retention**: Keep 10 per pattern (configurable with `-k`)
- **Health check**: Alerts if dump FS ≥ 90% or backups > 4h stale
- **Safety**: All destructive operations default to dry-run

## USB/IP Device Management

The platform wraps the USB/IP CLI tools and can act as both exporter and importer at the same time:

- **Server-side**: Bind/unbind local USB devices for network sharing
- **Client-side**: Connect to/disconnect from remote USB devices
- **Bidirectional**: One host can share local devices while simultaneously consuming devices from another host
- **Web UI**: Manage unlimited remote peers from the Devices page in the dashboard
- **Shell helpers**: Source `modules/usbip/usbip-helpers.sh` for scripting

The backend exposes the following USB/IP endpoints:

- `GET /api/usbip/devices` for local exporters
- `GET /api/usbip/remote/:host/devices` for peer exports
- `GET /api/usbip/ports` for imported devices
- `POST /api/usbip/bind`, `POST /api/usbip/unbind`
- `POST /api/usbip/connect`, `POST /api/usbip/disconnect`

There is no application-level peer cap; limits are driven by the host and the USB/IP daemon.

Useful environment overrides:

- `USBIP_FRONTEND_DIR` points the backend at a packaged frontend bundle when running from a release archive.
- `USBIP_BIN` selects the USB/IP command if the default (`usbip` on Unix, `usbipd` on Windows) is not the right one for the host.
- `USBIP_API_RATE_LIMIT` and `USBIP_MUTATION_RATE_LIMIT` can be raised when you need to poll or manage many peers.

## Testing

```bash
# Shell tests (BATS)
bats tests/

# Frontend lint
cd webapp/frontend && npx eslint src --ext .js,.jsx

# Shellcheck all scripts
find modules/ tools/ scripts/ -name '*.sh' -exec shellcheck {} +

# E2E tests (requires running backend)
cd e2e && npx playwright test
```

## CI/CD

Workflow templates in `.github/workflows/`:
- **ci-frontend.yml**: Lint + build frontend
- **ci-full.yml**: Full backend + frontend build + test
- **e2e.yml**: Playwright E2E suite
- **release.yml**: Tag-triggered multi-platform release assets + checksums

Release notes:

- Push a tag like `v0.1.0` to publish Linux, macOS, and Windows release archives automatically.
- `workflow_dispatch` can be used to validate the release build without publishing a tag.
- Each archive bundles the backend binary, `frontend/dist`, and docs so the release is self-contained.

> Requires GitHub PAT/SSH key and runner registration token to activate.

## Security

- `tools/ensure-no-secrets.sh` — scans repo for accidental credential leaks
- `tools/harden-scripts.sh` — enforces safe permissions and patterns
- All offload/prune/cron scripts default to **dry-run mode**
- Never deletes host files outside LXC dump directory
