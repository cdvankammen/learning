Offload archives guide

Script: /home/chris/Documents/usbip/tools/offload-archives.sh

Usage:
  Dry-run (safe):
    /home/chris/Documents/usbip/tools/offload-archives.sh --bucket my-bucket --days 30 --dry-run

  Execute upload (requires AWS credentials in env or aws profile):
    AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... /home/chris/Documents/usbip/tools/offload-archives.sh --bucket my-bucket --days 30 --exec --delete-after-copy

  Execute upload with rclone (requires rclone configured with a destination):
    /home/chris/Documents/usbip/tools/offload-archives.sh --rclone-dest s3:my-bucket/archives --days 30 --exec --delete-after-copy

Notes:
- The script supports AWS CLI (recommended). It will not persist credentials in git.
- For rclone, provide --rclone-dest or set RCLONE_DEST to an rclone destination such as `s3:bucket/prefix`.
- Test with --dry-run first.
