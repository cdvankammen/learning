#!/usr/bin/env bash
set -euo pipefail
OUT=/usbip/session-files/release-draft.md
cat > "$OUT" <<'MD'
# Release draft

## Summary
- Describe key changes here.

## Changelog (auto-generated)
MD

git --no-pager log --pretty=format:'- %s (%an)' "$(git describe --tags --abbrev=0 2>/dev/null || echo '')..HEAD" >> "$OUT" 2>/dev/null || git --no-pager log -n 50 --pretty=format:'- %s (%an)' >> "$OUT"

echo "Release draft written to $OUT"
