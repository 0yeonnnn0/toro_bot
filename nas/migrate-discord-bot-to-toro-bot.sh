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
# 5분마다 Docker Hub에서 새 이미지 확인 후 재시작
# NAS Task Scheduler에 등록: */5 * * * *

COMPOSE_DIR="/volume1/docker/toro-bot"
LOG_FILE="$COMPOSE_DIR/sync.log"
IMAGE="dusehd1/toro-bot:latest"
SERVICE="toro-bot"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

cd "$COMPOSE_DIR" || exit 1

OLD_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || true)
docker compose pull "$SERVICE" >> "$LOG_FILE" 2>&1
NEW_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || true)

if [ "$OLD_DIGEST" != "$NEW_DIGEST" ]; then
  log "New image detected. Restarting toro-bot..."
  docker compose up -d "$SERVICE" >> "$LOG_FILE" 2>&1
  log "TORO bot restarted with new image."
else
  log "No update."
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
