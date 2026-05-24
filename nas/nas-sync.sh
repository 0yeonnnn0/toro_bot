#!/bin/bash
# NAS 디스코드봇 자동 배포 스크립트
# 5분마다 Docker Hub에서 새 이미지 확인 후 재시작
# NAS Task Scheduler에 등록: */5 * * * *

COMPOSE_DIR="/volume1/docker/toro-bot"
LOG_FILE="$COMPOSE_DIR/sync.log"
IMAGE="dusehd1/toro-bot:latest"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

cd "$COMPOSE_DIR" || exit 1

# 현재 이미지 digest 저장
OLD_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null)

# 새 이미지 pull
docker compose pull toro-bot >> "$LOG_FILE" 2>&1

# 새 이미지 digest 비교
NEW_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null)

if [ "$OLD_DIGEST" != "$NEW_DIGEST" ]; then
  log "New image detected. Restarting toro-bot..."
  docker compose up -d toro-bot >> "$LOG_FILE" 2>&1
  log "TORO bot restarted with new image."
else
  log "No update."
fi

# 로그 파일 1000줄 제한
tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
