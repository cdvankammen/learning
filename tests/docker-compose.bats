#!/usr/bin/env bats

setup() {
  REPO_ROOT="${USBIP_REPO_ROOT:-$(cd "$BATS_TEST_DIRNAME/.." && pwd)}"
}

@test "docker compose keeps the runtime self-contained" {
  run grep -Fq 'USBIP_CONFIG_DIR: /home/node/.config/usbip-web' "$REPO_ROOT/docker-compose.yml"
  [ "$status" -eq 0 ]

  run grep -Fq 'USBIP_BIND_HOST: 0.0.0.0' "$REPO_ROOT/docker-compose.yml"
  [ "$status" -eq 0 ]

  run grep -Fq 'usbip-config:/home/node/.config/usbip-web' "$REPO_ROOT/docker-compose.yml"
  [ "$status" -eq 0 ]

  run grep -Fq '/etc/pve' "$REPO_ROOT/docker-compose.yml"
  [ "$status" -ne 0 ]

  run grep -Fq '/var/lib/vz/dump' "$REPO_ROOT/docker-compose.yml"
  [ "$status" -ne 0 ]
}

@test "dockerfile builds the frontend and backend in stages" {
  run grep -Fq 'FROM node:22-alpine AS frontend-deps' "$REPO_ROOT/Dockerfile"
  [ "$status" -eq 0 ]

  run grep -Fq 'COPY --from=frontend-deps /app/webapp/frontend/node_modules ./webapp/frontend/node_modules' "$REPO_ROOT/Dockerfile"
  [ "$status" -eq 0 ]

  run grep -Fq 'FROM node:22-alpine AS backend-deps' "$REPO_ROOT/Dockerfile"
  [ "$status" -eq 0 ]

  run grep -Fq 'COPY --from=frontend-build --chown=node:node /app/webapp/frontend/dist ./webapp/frontend/dist' "$REPO_ROOT/Dockerfile"
  [ "$status" -eq 0 ]
}
