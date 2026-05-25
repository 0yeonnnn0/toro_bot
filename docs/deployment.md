# TORO Home Server Deployment

## 실행

```bash
docker compose build
docker compose up -d
docker compose logs -f --tail=100
```

SQLite DB는 `./data:/app/data` 볼륨에 저장된다. Compose 파일은 `DATABASE_URL` 기본값을 `file:/app/data/toro.db`로 제공한다. 컨테이너 시작 시 `prisma migrate deploy` 후 앱을 시작한다. ffmpeg와 yt-dlp가 이미지에 포함된다.

캘린더 OAuth 토큰 암호화 키는 `.env`에 `TOKEN_ENCRYPTION_KEY`를 직접 넣지 않아도 된다. production에서 값이 없으면 컨테이너가 `/app/data/token-encryption.key`를 자동 생성한다. `./data:/app/data` 볼륨이 유지되면 재시작/업데이트 후에도 같은 키를 사용한다. 이 파일을 잃어버리면 기존 캘린더 refresh token을 복호화할 수 없으므로 `data/` 백업 대상에 포함한다.

채팅 기본 AI는 OpenAI API 키가 아니라 Codex CLI 연결을 사용한다. 컨테이너는 `CODEX_HOME=/codex`를 읽고, compose는 호스트의 `${CODEX_HOME_HOST:-./codex}`를 `/codex`로 마운트한다. NAS에서는 Codex CLI 로그인을 한 뒤 `auth.json`/`config.toml`을 `/volume1/docker/toro-bot/codex/` 아래에 두거나, `.env`에 `CODEX_HOME_HOST=/path/to/.codex`를 지정한다. Codex CLI가 세션 토큰을 갱신할 수 있어야 하므로 이 마운트는 read-write다. `GOOGLE_API_KEY`는 Codex 실패 시 Gemini fallback과 RAG용으로만 유지한다. `/draw`는 Codex CLI/ChatGPT 로그인 세션을 우선 사용하고, `OPENAI_API_KEY`가 있으면 OpenAI image API를 fallback으로 사용한다.


## NAS 영구 이름 전환: discord-bot → toro-bot

기존 NAS 배포가 아직 `/volume1/docker/discord-bot`, service/container `discord-bot` 이름을 쓰고 있다면 임시로 image만 바꾸지 말고 한 번에 영구 전환한다.

1. NAS에 SSH 접속한다.
2. 기존 데이터 백업을 만든 뒤 디렉터리와 compose/service 이름을 `toro-bot`으로 바꾼다.
3. Synology Task Scheduler의 스크립트 경로도 `/volume1/docker/toro-bot/nas-sync.sh`로 바꾼다.

레포의 `nas/migrate-discord-bot-to-toro-bot.sh`를 NAS에 복사해서 실행하면 된다.

```bash
# NAS에서 실행
cd /volume1/docker
curl -fsSL https://raw.githubusercontent.com/0yeonnnn0/toro_bot/main/nas/migrate-discord-bot-to-toro-bot.sh -o migrate-discord-bot-to-toro-bot.sh
chmod +x migrate-discord-bot-to-toro-bot.sh
./migrate-discord-bot-to-toro-bot.sh
```

마이그레이션 결과:
- 기존 `/volume1/docker/discord-bot` 전체를 `/volume1/docker/toro-bot-migration-backups/<timestamp>/discord-bot`에 백업한다.
- 기존 컨테이너/compose를 내린다.
- `/volume1/docker/discord-bot`을 `/volume1/docker/toro-bot`으로 rename한다.
- compose service/container/image를 모두 `toro-bot` 기준으로 재작성한다.
- Watchtower가 label-enable 모드에서도 감시하도록 `com.centurylinklabs.watchtower.enable=true` label을 붙인다.
- `DATABASE_URL` 기본값을 `file:/app/data/toro.db`로 보강한다.
- Codex CLI 로그인 캐시 마운트를 위해 `/volume1/docker/toro-bot/codex`를 만들고 `/codex`로 마운트한다.
- 최신 `dusehd1/toro-bot:latest` 이미지를 pull하고 새 컨테이너를 띄운다.

전환 후 확인:

```bash
cd /volume1/docker/toro-bot
docker compose ps -a
docker compose logs --tail=200 toro-bot
```

Task Scheduler에 기존 `/volume1/docker/discord-bot/nas-sync.sh`가 등록되어 있으면 반드시 `/volume1/docker/toro-bot/nas-sync.sh`로 바꾼다.

자동 업데이트 작업은 Synology Task Scheduler에서 root 권한 또는 Docker socket 접근 권한이 있는 사용자로 실행해야 한다. 예시 명령:

```bash
/volume1/docker/toro-bot/nas-sync.sh
```

스크립트는 Docker Hub의 `dusehd1/toro-bot:latest`를 pull한 뒤 이미지 ID/digest가 바뀌었거나 현재 컨테이너가 최신 이미지를 쓰지 않을 때만 `docker compose up -d --remove-orphans toro-bot`로 재생성한다. 실행 로그는 `/volume1/docker/toro-bot/sync.log`에 남는다.

## 컨테이너가 바로 종료될 때 확인할 것

```bash
docker compose logs --tail=200 toro-bot
cat .env | grep -E '^(DATABASE_URL|DISCORD_TOKEN|DASHBOARD_SECRET|AI_PROVIDER|TOKEN_ENCRYPTION_KEY)='
```

주요 원인:
- `DATABASE_URL`이 없는 기존 `.env`: 최신 Compose에서는 기본값을 넣어 방지한다.
- 기존 DB에 같은 Discord `guildId` 팀이 중복됨: `Team.guildId` unique migration이 실패할 수 있다. 이 경우 중복 row를 정리한 뒤 다시 `docker compose up -d` 한다.


`/say`는 기본적으로 API key 없는 Edge TTS를 사용한다. `TORO_TTS_PROVIDER=openai`와 `OPENAI_API_KEY`를 설정하면 OpenAI TTS를 우선 사용할 수 있다.


### Google Calendar OAuth URL

운영에서는 `TORO_PUBLIC_URL=https://외부접속주소`를 설정하면 `GOOGLE_REDIRECT_URI`가 없을 때 `${TORO_PUBLIC_URL}/api/calendar/oauth/callback`을 자동 사용한다. Google Cloud Console에도 같은 callback URL을 등록해야 한다.


### Media fallback behavior

- `/draw` tries Codex CLI first and OpenAI image API second when `OPENAI_API_KEY` exists. If both are unavailable, it still returns a local SVG fallback card so the command does not hard-fail.
- `/say` uses Python `edge-tts` by default, so it does not require `OPENAI_API_KEY`. OpenAI TTS is only used when explicitly configured or as a fallback with a key.
