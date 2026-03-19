lxc-provision module

This module provides a safe helper script to create LXC containers on this Proxmox host.

create-lxc-safe.sh usage:
  ./create-lxc-safe.sh [VMID] [TEMPLATE] [PASSWORD] [MEM] [CORES] [NET] [STORAGE]

Defaults:
  - TEMPLATE: local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst
  - PASSWORD: violin
  - MEM: 1024
  - CORES: 1
  - NET: name=eth0,bridge=vmbr0
  - STORAGE: local

Notes:
- Script chooses VMID from 500-999 if not provided. It avoids overwriting existing CTs.
- It will fail if the requested template is not present locally; use pveam to download templates.
