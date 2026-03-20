USB/IP & Web Server Research Index

This document indexes the research notes and references used in the usbip project.

Research library

- `usbipResearchReadOnly/USB_IP_Comprehensive_Report.docx` — broad USB/IP architecture, limitations, security, cross-platform ecosystem, and management-UI ideas.
- `usbipResearchReadOnly/usb_ip_technical_architecture_report_20260318_012507.docx` — technical deep dive on encapsulation, single-client behavior, throughput limits, and isochronous transfer issues.
- `usbipResearchReadOnly/usb_ip_comprehensive_deep_dive_20260318_011831.docx` and `usbipResearchReadOnly/usb_ip_comprehensive_deep_dive_20260318_012315.docx` — device-class compatibility notes, media streaming caveats, and UI orchestration ideas.
- `usbipResearchReadOnly/USBIP - UnisonBridge_Blueprint.docx` and `usbipResearchReadOnly/SHORT DOC -uSbip with front end server .docx` — frontend/server layout and controller concepts.
- `usbipResearchReadOnly/claude - usbip_definitive_v3.html` and `usbipResearchReadOnly/prompt coach usb Ip.rtfd/TXT.rtf` — synthesized architecture notes that favor mDNS-sd discovery, per-OS agents, and virtual-device modules such as v4l2loopback and ALSA loopback.
- `docs/research-index.txt` — raw file inventory for the read-only research folder.

Adjacent examples worth tracking separately

- `https://github.com/seastwood/usb-audio-ip-client` — a Linux GUI that combines USB/IP with PipeWire so audio and microphone streams can be routed between machines.
- `https://github.com/AlexxIT/go2rtc` — a streaming bridge with codec negotiation, FFmpeg sources, two-way audio, and cross-platform binaries; useful as a media-side complement when USB/IP is the wrong fit.

Topics

- Web servers (Express, NGINX): see `webapp/backend` and `templates/nginx.conf`
- USB/IP: backend API endpoints, `bin/usbip-ctl`, and the USB/IP helper scripts used for bind/unbind/connect/disconnect workflows
- LXC & Proxmox: `modules/lxc-restore/restore-or-replace.sh` and `modules/lxc-provision`
- Backups: `modules/backup/prune-backups.sh` and `tools/backup-*.sh`
- CI/CD: `.github/workflows/*` and `Dockerfile.ci`
- Tests: `tests/*.bats`, `webapp/backend/__tests__`, `e2e/`

Key USB/IP findings from the research

- USB/IP transports raw USB traffic over TCP/IP; it is not a media codec layer.
- Storage, HID, and other control-oriented peripherals are the safest starting points.
- High-bandwidth or isochronous devices such as webcams, capture cards, and some USB audio devices are more likely to show timing or throughput problems.
- The protocol is generally single-client per exported device, so any "unlimited" behavior has to come from many devices and many peers, not many clients attached to the same device.
- Connectivity and driver failures should be surfaced directly: missing binaries, unreachable hosts, timeout errors, and platform-specific USB/IP driver issues all need visible errors.

Implementation notes

- The management GUI is intentionally split from the backend so a separate controller can talk to any node over HTTP/CORS.
- `bin/usbip-ctl` is the terminal control plane; set `API_URL` to a peer node to query or manage that node directly.
- npm is used for build orchestration, but OS-specific USB/IP binaries and drivers are still required at runtime on each platform. Linux has the strongest native story, Windows uses `usbipd`/`usbipd-win`, and macOS support remains experimental or third-party.

Local attachments

- `usbipResearchReadOnly/` (if present) contains external read-only research materials.
