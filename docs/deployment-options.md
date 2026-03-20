# Deployment options

This repository supports three practical deployment paths:

## Docker

Use the multi-stage `Dockerfile` and the root `docker-compose.yml` for a self-contained container build.

```bash
docker compose up --build -d
```

The container stores its settings in the `usbip-config` volume and exposes the web UI on port `3001`.

## Proxmox LXC

If you run Proxmox, the `modules/lxc-provision/install-usbip-lxc.sh` helper can provision a container,
install Node.js tooling inside it, clone the repository, build the frontend, and enable the `usbip-web`
systemd service.

```bash
cd /home/chris/Documents/usbip
sudo bash modules/lxc-provision/install-usbip-lxc.sh --repo-url "$(git remote get-url origin)" --dry-run
```

Pass `--with-usbip` if you also want the container to install the `usbip` and `usbutils` packages.

## Future runtime variants

The current Node/Express application stays the source of truth. Future Rust or Python variants should
reuse the same API and deployment contract rather than replacing the current implementation outright.
That keeps the existing web UI, release artifacts, and helper scripts aligned even if a later runtime
specializes in a narrower task.
