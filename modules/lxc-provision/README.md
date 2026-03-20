lxc-provision module

This module provides safe helper scripts to create and bootstrap LXC containers on a Proxmox host.

create-lxc-safe.sh usage:
  ./create-lxc-safe.sh [VMID] [TEMPLATE] [PASSWORD] [MEM] [CORES] [NET] [STORAGE]

Defaults:
  - TEMPLATE: local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst
  - PASSWORD: violin
  - MEM: 1024
  - CORES: 1
  - NET: name=eth0,bridge=vmbr0
  - STORAGE: local

install-usbip-lxc.sh usage:
  ./install-usbip-lxc.sh --repo-url https://github.com/yourorg/usbip.git [--dry-run]

This helper provisions a Proxmox LXC, installs Node.js tooling inside the container, clones the
repository, builds the frontend, installs the backend dependencies, and enables the usbip-web
systemd service. Use `--with-usbip` if you also want the container to install the usbip/usbutils
packages for local device experiments.

Notes:
- Script chooses VMID from 500-999 if not provided. It avoids overwriting existing CTs.
- It will fail if the requested template is not present locally; use pveam to download templates.
