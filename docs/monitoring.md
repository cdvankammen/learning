Monitoring (Uptime-Kuma) — quick guide

Overview
- Uptime-Kuma is installed in the monitor LXC created at VMID 502 (hostname uptime-kuma-502).
- Default service port: 3001 (confirm inside CT: pct exec 502 -- ss -ltnp).
- Access: container receives DHCP IP on the 'google' bridge. Find IP with: pct exec 502 -- ip -4 -o addr show

If you use a reverse proxy (nginx-proxy-mgr), create a route from a public hostname to the container IP:3001.

Admin setup
- First-time access: open Uptime-Kuma UI and create an admin user via the web UI.
- Optionally seed admin via the API (not automated here for safety).

Automated checks
- health-check.sh runs hourly via cron and verifies dump dir usage and latest CT500 backup age.
- prune-backups.sh retains recent archives and runs nightly (03:15) via cron.

Troubleshooting
- Logs: /usbip/session-files/health-check-run.log, /usbip/session-files/prune-run.log
- To restart Uptime-Kuma inside CT502: pct exec 502 -- pm2 restart uptime-kuma || pct exec 502 -- bash -lc "nohup node /opt/uptime-kuma/server/server.js &> /var/log/uptime-kuma.log &"

