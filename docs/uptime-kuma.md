Uptime-Kuma automation

What this script does (/home/chris/Documents/usbip/tools/uptime-kuma-automation.sh):
- Locates Uptime-Kuma SQLite DB in common locations and makes a timestamped backup to /usbip/session-files.
- Prints guidance for safe admin creation; does not auto-insert admin credentials.

Manual steps to create admin (recommended):
1. Use the web UI to create the first admin account.
2. If automation is required, provide a secure hashed password and an exact DB schema migration plan before inserting via sqlite3.

To run the automation:
  bash /home/chris/Documents/usbip/tools/uptime-kuma-automation.sh

This script is intentionally conservative to avoid creating insecure default accounts.
