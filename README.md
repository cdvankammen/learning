# USB/IP Management Platform

A comprehensive USB/IP platform with optional Proxmox LXC integration, a modern web dashboard, automated backups, and CI/CD pipeline support.

## Architecture

```
 /home/chris/Documents/usbip/
├── webapp/
│   ├── frontend/          # Vite + React SPA (Dashboard, Computers, Devices, Settings, optional LXC helpers)
│   └── backend/           # Express + Socket.IO API server
├── modules/
│   ├── lxc-provision/     # Optional LXC creation with safe defaults
│   ├── lxc-restore/       # Optional restore-or-replace from vzdump archives
│   ├── backup/            # Optional prune retention & restore validation
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
cd webapp/backend && USBIP_BIND_HOST=0.0.0.0 node index.js

# Or use the root convenience wrappers
npm run build
npm run serve
npm run status
npm run discover
```

Open http://localhost:3001 to access the dashboard.

The backend binds to all interfaces by default, so you can reach it through any LAN IP on the host. The new `Computers` page shows the reachable URLs that the machine advertises on the network.

Live UI updates are pushed over the backend WebSocket endpoint at `/ws`, so the Clients, Devices, Computers, and optional Proxmox views refresh without manual reloads when the backend state changes.

### Deployment options

The same app can be started in a few different ways:

```bash
# Self-contained Docker image
docker compose up --build -d

# Proxmox LXC bootstrap helper
sudo bash modules/lxc-provision/install-usbip-lxc.sh --repo-url "$(git remote get-url origin)" --dry-run
```

See [`docs/deployment-options.md`](docs/deployment-options.md) for the longer deployment notes, including the Docker volume layout, the LXC helper flow, and the roadmap note for future runtime variants.

Saved peers now persist through the backend `GET /api/peers` and `PUT /api/peers` routes, and the full runtime snapshot is available from `GET /api/persistence`.

The backend also serves `GET /api/openapi.json` as a machine-readable API description for the current HTTP routes.

The terminal CLI lives at `bin/usbip-ctl`. Point `API_URL` at any node's `/api` base URL to control that node directly from the terminal:

```bash
API_URL=http://192.168.1.25:3001 bin/usbip-ctl status
API_URL=http://192.168.1.25:3001 bin/usbip-ctl devices
API_URL=http://192.168.1.25:3001 bin/usbip-ctl connect 192.168.1.30 1-2
```

You can also persist those defaults in `~/.usbip/config` as `KEY=VALUE` pairs. Supported keys include `API_URL`, `USBIP_SERVICE_NAME`, `USBIP_SERVICE_MANAGER`, `USBIP_MDNS_SERVICE_TYPE`, `USBIP_MDNS_PID_FILE`, and `USBIP_MDNS_LOG_FILE`. Set `USBIP_CLI_CONFIG_FILE` if you want the CLI to read a different file.
Set `DRY_RUN=1` before a mutation command to preview bind, unbind, connect, disconnect, and virtual bridge actions.
Pass `--json` or set `USBIP_OUTPUT_FORMAT=json` to print machine-readable output for the commands that already talk to the API.

Shell completion scripts live under `completions/`. Source `completions/usbip-ctl.bash` for bash, or `completions/usbip-ctl.zsh` for zsh with `bashcompinit` enabled.

For local service control, use the `up`, `down`, `restart`, and `service status` commands:

```bash
sudo bin/usbip-ctl up
sudo bin/usbip-ctl service status
sudo bin/usbip-ctl restart
```

Those commands wrap the local `usbip-web` system service on systemd hosts. `serve` still starts the backend in the foreground for development, while `up/down/restart` are the service-manager path. If you need a different manager name, set `USBIP_SERVICE_NAME` or `USBIP_SERVICE_MANAGER`.

For a one-shot systemd install, run `bash tools/install-service.sh --install`. The helper renders `templates/usbip-web.service` against the current checkout root, so the resulting unit no longer depends on a hardcoded path.

The same actions are available through npm from the repository root:

```bash
npm run up
npm run down
npm run restart
npm run service -- status
```

The Computers page also calls `GET /api/discovery/peers` to show live nodes found by the subnet-scan fallback. Save any of those peers to keep them in the manual peer list across reloads.

The separate virtual-device layer is exposed through `GET /api/virtual-bridges` and `POST /api/virtual-bridges/:id/:action`. Use `usbip-ctl virtual status`, `usbip-ctl virtual start <bridge>`, and `usbip-ctl virtual restart <bridge>` to inspect or drive the configured media bridges from the terminal.

Add `?peer=http://node:3001` to any frontend route if you want the same UI to talk to a different node instead of opening a separate origin.

### Webcams, codecs, and media bridges

USB/IP forwards raw USB traffic. It can expose a camera or audio device, but it does **not** add codec negotiation, transcoding, or media buffering.

In practice:

| Device / format | USB/IP fit | Notes |
|------------------|------------|-------|
| HID, storage, serial | Good | Best reliability |
| MJPEG webcams on a fast LAN | Sometimes | Works best at lower resolutions / frame rates |
| Hardware H.264 camera output | Sometimes | Better than raw YUYV, but still timing-sensitive |
| Uncompressed YUYV / raw video | Poor | High bandwidth and isochronous timing make it fragile |
| Capture cards / real-time audio on Wi-Fi or WAN | Poor | Use a media bridge instead |

For stable video and audio sharing, prefer the virtual-device layer:

- `go2rtc` for codec-aware video streaming
- `v4l2loopback` for local camera exposure on Linux
- PipeWire or ALSA loopback for Linux audio routing

The web UI and `usbip-ctl virtual` namespace manage those bridges separately from physical USB/IP passthrough.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service health + version |
| GET | `/api/metrics` | Prometheus-style request, device, and health metrics |
| GET | `/api/system` | Host info (hostname, CPU, memory, load) |
| GET | `/api/network/interfaces` | Local interface inventory and bind host |
| GET | `/api/settings` | Current settings snapshot with schema and config file path |
| POST | `/api/settings` | Save settings (validates first; 400 on error) |
| POST | `/api/settings/validate` | Validate settings payload without saving |
| GET | `/api/peers` | Persisted peer node list |
| PUT | `/api/peers` | Replace the persisted peer node list |
| GET | `/api/persistence` | Full backend persistence snapshot |
| GET | `/api/lxc/list` | List all LXC containers |
| GET | `/api/lxc/:id/status` | Single container status |
| GET | `/api/backups` | List vzdump backup archives |
| GET | `/api/usbip/devices` | List local USB devices |
| GET | `/api/usbip/capabilities` | Report USB/IP server/client capability flags |
| GET | `/api/usbip/ports` | List imported USB/IP ports |
| GET | `/api/usbip/remote/:host/devices` | List devices exported by a peer host |
| GET | `/api/discovery/peers` | LAN peer discovery (subnet-scan + mDNS fallback) |
| GET | `/api/virtual-bridges` | List virtual audio/video bridge profiles |
| GET | `/api/virtual-bridges/:id` | Inspect one virtual bridge profile |
| POST | `/api/virtual-bridges/:id/:action` | Run bridge start/stop/restart/status commands |
| POST | `/api/usbip/bind` | Bind device for USB/IP export |
| POST | `/api/usbip/unbind` | Unbind device |
| POST | `/api/usbip/connect` | Attach a remote USB/IP device |
| POST | `/api/usbip/disconnect` | Detach an imported USB/IP device |

### Settings

The backend reads and writes settings from `$USBIP_CONFIG_DIR/settings.json` (default: `~/.config/usbip-web/settings.json`). The schema includes: `bindHost`, `port`, `corsAllowedOrigins`, `usbipBin`, `apiRateLimit`, `mutationRateLimit`, `mdnsServiceType`, and `logRequests`.

Optional API authentication is configured through environment variables instead of the settings file:

- `USBIP_AUTH_ADMIN_TOKEN` enables admin-only access for mutating endpoints.
- `USBIP_AUTH_VIEWER_TOKEN` enables read-only access for dashboard and metrics requests.
- `USBIP_AUTH_REQUIRED=1` forces auth even if only one token is set.

Send the token as `Authorization: Bearer <token>` or `X-USBIP-Token: <token>`. When auth is enabled, GET `/api/health` remains public for probes, while `/api/metrics`, settings, USB/IP mutation routes, and the optional Proxmox integration routes require a valid token.

The **Settings** page in the web UI connects to these three endpoints to provide a live, schema-driven configuration editor with validate-before-save support.


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
- **Web UI**: Manage unlimited remote peers from the Devices page, and use the Computers page to discover and jump to them
- **Computers page**: Discover LAN nodes, inspect their reachable URLs, and jump to each node's direct UI
- **Shell helpers**: Source `modules/usbip/usbip-helpers.sh` for scripting

The backend exposes the following USB/IP endpoints:

- `GET /api/usbip/devices` for local exporters
- `GET /api/usbip/remote/:host/devices` for peer exports
- `GET /api/usbip/ports` for imported devices
- `POST /api/usbip/bind`, `POST /api/usbip/unbind`
- `POST /api/usbip/connect`, `POST /api/usbip/disconnect`

There is no application-level peer cap; limits are driven by the host and the USB/IP daemon.

USB/IP carries raw USB transfers, not an application codec layer. Storage and HID devices are usually the most reliable starting point, while webcams, capture devices, and some USB audio peripherals can be sensitive to latency or isochronous-transfer limits.

The npm scripts in this repository provide cross-platform build orchestration for the web app and release packaging, and the GitHub release workflow publishes Linux x64/arm64, macOS arm64, and Windows x64 archives. The actual USB/IP runtime still depends on the host platform's USB/IP binary or driver stack (`usbip` on Linux, `usbipd`/usbipd-win on Windows, and experimental or third-party support on macOS).

Virtual devices are a separate layer from USB/IP. If the end goal is to expose audio, video, or other non-USB sources, route them through a media bridge or a virtual-device driver on the host OS, then surface that endpoint in the UI as its own resource. The `usb-audio-ip-client` project is a good example of pairing USB/IP with PipeWire on Linux, `go2rtc` is a good example of a media-side bridge with codec negotiation and FFmpeg sources, and the read-only research points to `v4l2loopback` plus ALSA loopback as the Linux path for virtual camera/audio modules.

Useful environment overrides:

- `USBIP_FRONTEND_DIR` points the backend at a packaged frontend bundle when running from a release archive.
- `USBIP_BIND_HOST` controls the interface bind address; it defaults to `0.0.0.0` so the service is reachable on all local interfaces.
- `USBIP_BIN` selects the USB/IP command if the default (`usbip` on Unix, `usbipd` on Windows) is not the right one for the host.
- `USBIP_API_RATE_LIMIT` and `USBIP_MUTATION_RATE_LIMIT` can be raised when you need to poll or manage many peers.
- `USBIP_CORS_ALLOW_ALL=1` or `USBIP_ALLOWED_ORIGINS=http://mgmt.example:3001` can be used when a separate management GUI needs to talk directly to multiple nodes in the LAN.
- `USBIP_AUTH_ADMIN_TOKEN`, `USBIP_AUTH_VIEWER_TOKEN`, and `USBIP_AUTH_REQUIRED` enable the optional token-based RBAC layer.

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
- `workflow_dispatch` can be used to validate the release build without publishing, or to publish manually by setting `publish_release=true` and supplying a `release_tag`.
- Each archive bundles the backend binary, `frontend/dist`, and docs so the release is self-contained.

> Requires GitHub PAT/SSH key and runner registration token to activate.

## Security

- `tools/ensure-no-secrets.sh` — scans repo for accidental credential leaks
- `tools/harden-scripts.sh` — enforces safe permissions and patterns
- All offload/prune/cron scripts default to **dry-run mode**
- Never deletes host files outside LXC dump directory
