Backup prune module

This module provides `prune-backups.sh` which safely prunes older backup archives in /var/lib/vz/dump.

Behavior:
- Keeps the most recent N backups per pattern (default 10)
- Operates only on /var/lib/vz/dump matching trusted filename patterns
- Supports --dry-run for safe validation
- Logs to /usbip/session-files/prune-backups.log

Usage:
  ./prune-backups.sh --dry-run
  ./prune-backups.sh -k 20
