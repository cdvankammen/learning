#!/usr/bin/env bash
set -euo pipefail

usage(){ echo "Usage: $0 --remote-url URL --auth-method [ssh_private_key|https_token] [--ssh-key-file PATH|--https-token TOKEN]"; exit 2; }
REMOTE=""
AUTH=""
SSH_KEY_FILE=""
HTTPS_TOKEN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --remote-url) REMOTE="$2"; shift 2;;
    --auth-method) AUTH="$2"; shift 2;;
    --ssh-key-file) SSH_KEY_FILE="$2"; shift 2;;
    --https-token) HTTPS_TOKEN="$2"; shift 2;;
    *) usage;;
  esac
done
if [ -z "$REMOTE" ] || [ -z "$AUTH" ]; then usage; fi
cd /usbip/repo || exit 1
git remote remove origin 2>/dev/null || true
if [ "$AUTH" = "ssh_private_key" ]; then
  if [ -z "$SSH_KEY_FILE" ]; then echo "SSH key file required"; exit 1; fi
  eval $(ssh-agent -s) >/dev/null 2>&1 || true
  ssh-add "$SSH_KEY_FILE" || true
  git remote add origin "$REMOTE"
  git push -u origin main
elif [ "$AUTH" = "https_token" ]; then
  if [ -z "$HTTPS_TOKEN" ]; then echo "HTTPS token required"; exit 1; fi
  if echo "$REMOTE" | grep -q '^https://'; then
    REMOTE_AUTH="$(echo "$REMOTE" | sed -E 's#https://#https://'$HTTPS_TOKEN'@#')"
    git remote add origin "$REMOTE_AUTH"
    git push -u origin main
  else
    echo "HTTPS token auth requires https remote URL"
    exit 1
  fi
else
  echo "Unknown auth method"
  exit 1
fi
