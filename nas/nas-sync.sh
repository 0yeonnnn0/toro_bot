#!/bin/bash
set -euo pipefail
# TORO bot NAS auto deploy script
# Register this in Synology Task Scheduler, e.g. every 5 minutes.

COMPOSE_DIR="${COMPOSE_DIR:-/volume1/docker/toro-bot}"
LOG_FILE="${LOG_FILE:-$COMPOSE_DIR/sync.log}"
IMAGE="${IMAGE:-dusehd1/toro-bot:latest}"
SERVICE="${SERVICE:-toro-bot}"
LOCK_DIR="${LOCK_DIR:-/tmp/toro-bot-nas-sync.lock}"

log() {
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Another sync is already running. Skipping."
  exit 0
fi
trap cleanup EXIT

cd "$COMPOSE_DIR" || {
  log "Compose directory not found: $COMPOSE_DIR"
  exit 1
}

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    log "Neither 'docker compose' nor 'docker-compose' is available."
    exit 1
  fi
fi

old_id="$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
old_digest="$(docker image inspect "$IMAGE" --format '{{join .RepoDigests ","}}' 2>/dev/null || true)"

log "Checking image update for $IMAGE"
if ! $COMPOSE pull "$SERVICE" >> "$LOG_FILE" 2>&1; then
  log "docker compose pull failed. Keeping current container."
  tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  exit 1
fi

new_id="$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
new_digest="$(docker image inspect "$IMAGE" --format '{{join .RepoDigests ","}}' 2>/dev/null || true)"

if [ -z "$new_id" ]; then
  log "Pulled image is missing locally after pull: $IMAGE"
  exit 1
fi

if [ "$old_id" != "$new_id" ] || [ "$old_digest" != "$new_digest" ]; then
  log "New image detected. Restarting $SERVICE..."
  $COMPOSE up -d --remove-orphans "$SERVICE" >> "$LOG_FILE" 2>&1
  log "Restarted $SERVICE with image id $new_id"
else
  running_id="$(docker inspect "$SERVICE" --format '{{.Image}}' 2>/dev/null || true)"
  if [ "$running_id" != "$new_id" ]; then
    log "Container is not using the current image. Recreating $SERVICE..."
    $COMPOSE up -d --remove-orphans "$SERVICE" >> "$LOG_FILE" 2>&1
    log "Recreated $SERVICE with image id $new_id"
  else
    log "No update."
  fi
fi

tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
