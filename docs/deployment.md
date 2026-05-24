# TORO Home Server Deployment

## 실행

```bash
docker compose build
docker compose up -d
docker compose logs -f --tail=100
```

SQLite DB는 `./data:/app/data` 볼륨에 저장된다. Compose 파일은 `DATABASE_URL` 기본값을 `file:/app/data/toro.db`로 제공한다. 컨테이너 시작 시 `prisma migrate deploy` 후 앱을 시작한다. ffmpeg와 yt-dlp가 이미지에 포함된다.

## 컨테이너가 바로 종료될 때 확인할 것

```bash
docker compose logs --tail=200 toro-bot
cat .env | grep -E '^(DATABASE_URL|DISCORD_TOKEN|DASHBOARD_SECRET|AI_PROVIDER|TOKEN_ENCRYPTION_KEY)='
```

주요 원인:
- `DATABASE_URL`이 없는 기존 `.env`: 최신 Compose에서는 기본값을 넣어 방지한다.
- 기존 DB에 같은 Discord `guildId` 팀이 중복됨: `Team.guildId` unique migration이 실패할 수 있다. 이 경우 중복 row를 정리한 뒤 다시 `docker compose up -d` 한다.
