#!/bin/bash
set -euo pipefail

# Permanent NAS migration from the old discord-bot deployment name to toro-bot.
# Run on Synology NAS over SSH as a user that can execute Docker commands.
# This script preserves .env, data/, and sync.log by moving the whole deployment directory.

OLD_DIR="${OLD_DIR:-/volume1/docker/discord-bot}"
NEW_DIR="${NEW_DIR:-/volume1/docker/toro-bot}"
SERVICE="toro-bot"
IMAGE="dusehd1/toro-bot:latest"
BACKUP_ROOT="${BACKUP_ROOT:-/volume1/docker/toro-bot-migration-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd docker
require_cmd rsync

if [ ! -d "$OLD_DIR" ] && [ ! -d "$NEW_DIR" ]; then
  echo "Neither $OLD_DIR nor $NEW_DIR exists. Nothing to migrate." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [ -d "$OLD_DIR" ]; then
  log "Backing up old deployment directory: $OLD_DIR -> $BACKUP_DIR/discord-bot"
  rsync -a --delete "$OLD_DIR/" "$BACKUP_DIR/discord-bot/"

  if [ -f "$OLD_DIR/docker-compose.yml" ]; then
    log "Stopping old compose service if it is running"
    (cd "$OLD_DIR" && docker compose down --remove-orphans) || true
  fi

  if [ -e "$NEW_DIR" ]; then
    log "New directory already exists. Backing it up before merge: $NEW_DIR -> $BACKUP_DIR/toro-bot-existing"
    rsync -a --delete "$NEW_DIR/" "$BACKUP_DIR/toro-bot-existing/"
  else
    log "Renaming deployment directory: $OLD_DIR -> $NEW_DIR"
    mv "$OLD_DIR" "$NEW_DIR"
  fi
fi

mkdir -p "$NEW_DIR/data"
mkdir -p "$NEW_DIR/codex"
cd "$NEW_DIR"

log "Writing permanent toro-bot docker-compose.yml"
cat > docker-compose.yml <<'YAML'
services:
  toro-bot:
    image: dusehd1/toro-bot:latest
    container_name: toro-bot
    restart: unless-stopped
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    ports:
      - "9482:3000"
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL:-file:/app/data/toro.db}
      CODEX_HOME: ${CODEX_HOME:-/codex}
    volumes:
      - ./data:/app/data
      - ${CODEX_HOME_HOST:-./codex}:/codex
YAML

log "Writing permanent toro-bot sync script"
cat > nas-sync.sh <<'SH'
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

SH
chmod +x nas-sync.sh

if [ ! -f .env ]; then
  log "WARNING: .env is missing. Create it from the repo .env.example before starting the container."
fi

log "Pulling latest image: $IMAGE"
docker compose pull "$SERVICE"

log "Starting permanent toro-bot service"
docker compose up -d "$SERVICE"

log "Container state"
docker compose ps -a

log "Recent logs"
docker compose logs --tail=120 "$SERVICE" || true

log "Migration complete. Backup saved at: $BACKUP_DIR"
log "Update Synology Task Scheduler path from /volume1/docker/discord-bot/nas-sync.sh to /volume1/docker/toro-bot/nas-sync.sh"
