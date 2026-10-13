# TORO

친구들 Discord 서버에서 **최근 대화를 읽고, 지금 필요한 정리·선택·음악·이미지를 처리한 뒤 잊는 AI 친구**다.

> 불러서 정리하고, 고르고, 놀고, 끝나면 잊는다.

## 제품 원칙

- TORO는 `@멘션`을 받았을 때만 대화에 참여한다.
- 요청 시점에 현재 채널·스레드의 Discord 메시지를 읽는다.
- 최근 2시간 메시지를 우선 사용하고, 50개 미만이면 최근 50개까지 범위를 넓힌다.
- 일반 채팅을 내부 버퍼·DB·RAG·Obsidian에 수집하지 않는다.
- 대화 원문, 답변 원문, 사용자 프로필을 운영 로그에 남기지 않는다.
- 별도 사용자 가입, 팀 생성, 캐릭터 프리셋, 오늘의 NPC가 없다.

## 핵심 기능

### 대화·정리·선택

- `@TORO 질문` — 현재 채널·스레드의 최근 대화를 바탕으로 답변
- `@TORO 정리해줘` — 결정된 내용, 할 일, 미정 사항 정리
- `@TORO 골라줘` — 대화에 나온 후보 중 하나를 선택
- `/summary` — 최근 Discord 대화 요약
- 최신 정보가 필요할 때 사용하는 간단한 웹 검색
- 첨부 이미지 인식

### 파티 음악

- `/play` — YouTube 검색 또는 URL 재생
- `/skip`, `/stop`, `/pause` — 재생 제어
- `/queue`, `/remove`, `/nowplaying` — 대기열 관리
- `/volume` — 볼륨 조절
- `/autoplay` — 추천 자동 재생
- `/music` — 현재 음악 큐를 확인하는 공개 웹 화면

공개 음악 기록은 곡 정보만 제공하며 Discord 요청자 이름과 사용자 순위는 저장하거나 노출하지 않는다.

### 이미지

- `/draw` 또는 자연어 이미지 요청
- Codex CLI/ChatGPT 로그인 세션을 우선 사용

### 운영

- `/mute`, `/mutestatus` — 채널별 멘션 응답 제어
- `/status` — 봇 상태 확인
- `/admin` — 집계 상태, 비식별 요청 로그, 모델 설정, 음악 관리
- `/healthz` — 공개 healthcheck

## 제거된 기능

- 일반 대화 자동 난입
- 장기 대화 DB와 RAG 기억
- Obsidian 사용자 정보 추출과 `/내정보`
- 팀 메모와 Calendar OAuth
- 공개 웹 AI 채팅
- Discord OAuth 팀 관리 화면
- 말투 프리셋과 오늘의 NPC
- `/say` TTS 명령

기존 DB 스키마와 일부 비활성 모듈은 안전한 롤백을 위해 당분간 남아 있을 수 있지만, 런타임과 사용자 화면에서는 호출하지 않는다. 시작 시 과거 음악 기록의 요청자 이름은 제거되고, 과거 `userStats`·`keywords` 상태는 다음 상태 저장 때 제외된다. 롤백 기간이 끝나면 운영자가 백업 후 `data/chat-logs.json`, `data/vectors/`, 기존 사용자 메모 파일을 삭제한다.

## 슬래시 명령어

- 대화: `/help`, `/summary`, `/status`, `/mute`, `/mutestatus`
- 이미지: `/draw`
- 음악: `/play`, `/skip`, `/stop`, `/pause`, `/queue`, `/nowplaying`, `/volume`, `/autoplay`, `/remove`

AI 질문의 기본 진입점은 슬래시 명령이 아니라 `@TORO` 멘션이다.

## 기술 스택

- Backend: Node.js, TypeScript, Express
- Frontend: React, Vite
- Discord: discord.js v14
- AI: Codex CLI 중심, Google/OpenAI/Anthropic 선택 가능
- Music: `@discordjs/voice`, yt-dlp, FFmpeg
- Deployment: Docker Compose, GitHub Actions, Watchtower

## Discord 권한

최근 대화 맥락을 읽으려면 다음 권한이 필요하다.

- Developer Portal: `Message Content Intent`
- 채널: `View Channel`, `Read Message History`, `Send Messages`
- 스레드: `Send Messages in Threads`, `Read Message History`

## 설치

```bash
git clone https://github.com/0yeonnnn0/discord_bot.git
cd discord_bot
npm install
cd frontend && npm install && npm run build && cd ..
npx prisma generate
```

## 주요 환경변수

```bash
cp .env.example .env
```

- `DISCORD_TOKEN` — Discord 봇 토큰
- `DASHBOARD_PORT` — 웹 서버 포트, 기본 `3000`
- `DASHBOARD_SECRET` — 관리자 대시보드 비밀번호
- `DATABASE_URL` — Prisma DB URL
- `AI_PROVIDER` — `codex`, `google`, `openai`, `anthropic`
- `CODEX_HOME`, `CODEX_BIN`, `CODEX_MODEL`, `CODEX_TIMEOUT_MS` — Codex 실행 설정
- `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — 선택 provider 키
- `CODEX_IMAGE_TIMEOUT_MS` — Codex 이미지 생성 제한 시간

비밀값은 git이나 문서에 넣지 않는다.

## 실행과 검증

```bash
npm run dev
npm run typecheck
npm test
npm run build
cd frontend && npm run build
```

Docker:

```bash
npm run docker:test
npm run docker:prod
```

운영 healthcheck:

```bash
curl -fsS http://localhost:${DASHBOARD_PORT:-3000}/healthz
```

## 배포

`main`에 push하면 GitHub Actions가 Docker 이미지를 갱신하고 NAS Watchtower가 `toro-bot` 컨테이너를 교체한다. 배포 후에는 `/healthz`, 실제 Discord 멘션, 명령어 목록, `/music` 화면을 확인한다.
