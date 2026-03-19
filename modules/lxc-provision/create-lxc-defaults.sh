#!/bin/bash
set -euo pipefail

# LXC creation helper using user defaults
# Defaults (can be overridden via flags)
var_os=debian
var_version=13
var_unprivileged=1
var_cpu=2
var_ram=2048
var_disk=10
var_brg=google
var_net=dhcp
var_ipv6_method=auto
var_ssh=yes
var_apt_cacher=yes
var_fuse=yes
var_tun=yes
var_gpu=yes
var_nesting=1
var_keyctl=1
var_mknod=1
var_protection=no
var_timezone=America/Denver
var_hostname=n8nnew
var_template_storage=backups
var_container_storage=local
password=violin

usage(){
  echo "Usage: $0 [-i vmid] [-h hostname]"
  exit 1
}

vmid=""
while getopts ":i:h:" opt; do
  case "$opt" in
    i) vmid="$OPTARG" ;;
    h) var_hostname="$OPTARG" ;;
    *) usage ;;
  esac
done

# find a free VMID in 500..999 if not provided
if [ -z "$vmid" ]; then
  used=$(pct list 2>/dev/null | awk 'NR>1{print $1}' || true)
  for i in $(seq 500 999); do
    if ! echo "$used" | grep -qx "$i"; then
      vmid=$i
      break
    fi
  done
  if [ -z "$vmid" ]; then
    echo "No free VMID in 500..999"; exit 1
  fi
fi

# Find a debian ${var_version} template in template cache
template_path=""
# Use a safe glob and avoid redirect in the for header
for f in /var/lib/vz/template/cache/*debian*${var_version}*; do
  if [ -f "$f" ]; then
    template_path="$f"
    break
  fi
done
if [ -z "$template_path" ]; then
  echo "No debian-${var_version} template found in /var/lib/vz/template/cache. Please download a template or provide --template." >&2
  exit 1
fi

echo "Creating LXC $vmid from template $template_path"
# Create LXC (attempt conservative options)
pct create "$vmid" "$template_path" \
  --rootfs ${var_container_storage}:${var_disk} \
  --cores "$var_cpu" \
  --memory "$var_ram" \
  --net0 name=eth0,bridge=${var_brg},ip=${var_net},type=veth \
  --net1 name=eth1,bridge=candy,ip=dhcp,type=veth \
  --unprivileged "$var_unprivileged" \
  --hostname "$var_hostname" \
  --features nesting=${var_nesting},keyctl=${var_keyctl},mknod=${var_mknod} || { echo "pct create failed"; exit 1; }

# Start and set root password
pct start "$vmid" || true
sleep 2
pct exec "$vmid" -- bash -lc "echo root:${password} | chpasswd" || true

echo "LXC $vmid created and password set to 'violin' (if start succeeded)."
