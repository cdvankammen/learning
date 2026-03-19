Restore-or-Replace module

This module provides a script `restore-or-replace.sh` which attempts to restore missing original LXC containers from available vzdump archives. If no suitable backup is found, it will create a replacement container from the Debian 13 template.

Usage:
  ./restore-or-replace.sh [-n|--dry-run] [--vmids 300,420]

Behavior:
- Does not modify existing host files or pre-existing containers.
- Respects the 500..599 free-ID policy for created/restored containers.
- Logs to /usbip/session-files/restore-or-replace.log
- Use --dry-run to simulate actions before applying.
