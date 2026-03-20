Runner setup and registration

This document explains how to register and run a GitHub self-hosted runner for this repository.

Prereqs:
- A registration token from GitHub (Repo Settings → Actions → Runners → Add runner → Generate token)
- Sufficient privileges on host to install services (sudo)

Steps:
1. Prepare runner files (already downloaded by tools/setup-self-hosted-runner.sh):
   cd /home/chris/Documents/usbip
   sudo ./tools/setup-self-hosted-runner.sh --url https://github.com/yourorg/yourrepo --name usbip-runner
   This will place the runner bits in /opt/actions-runner and write a helper at /usbip/session-files/runner-register.sh that registers from the extracted runner directory.

2. Register the runner (one-time, requires token):
   sudo bash -c 'cd /opt/actions-runner && ./config.sh --url https://github.com/yourorg/yourrepo --token <TOKEN> --name usbip-runner --labels self-hosted,proxmox --unattended'
   OR use the helper:
   sudo /usbip/session-files/runner-register.sh 'https://github.com/yourorg/yourrepo' <TOKEN> usbip-runner

3. Install service (post-registration):
   sudo /home/chris/Documents/usbip/tools/install-runner-service.sh --dir /opt/actions-runner --name usbip-runner
   This will create a systemd unit that starts the runner.

Notes:
- The runner will be labeled with 'self-hosted,proxmox' by default when registered using the helper script.
- Do NOT share the registration token publicly. It is single-use and expires quickly.
