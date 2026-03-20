Offload archives guide

Script: /usbip/repo/tools/offload-archives.sh

Usage:
  Dry-run (safe):
    /usbip/repo/tools/offload-archives.sh --bucket my-bucket --days 30 --dry-run

  Execute upload (requires AWS credentials in env or aws profile):
    AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... /usbip/repo/tools/offload-archives.sh --bucket my-bucket --days 30 --exec --delete-after-copy

Notes:
- The script supports AWS CLI (recommended). It will not persist credentials in git.
- For rclone or other backends, adapt the script or run rclone manually to copy /var/lib/vz/dump files.
- Test with --dry-run first.
