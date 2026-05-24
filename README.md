# TORO

친구들 디스코드 서버에 상주하며 자연스럽게 대화에 끼어드는 AI 봇.
단순한 명령어 봇이 아니라, 서버/팀 단위로 로그인·기억·일정·음악·AI 대화를 함께 관리한다.

## 핵심 기능

### 팀 기반 사용
- Discord 서버(guild)마다 하나의 팀을 만들고 팀 멤버로 로그인한다.
- `/team create`로 팀을 만들고, `/team invite`로 초대 코드를 발급한다.
- `/login`으로 웹 로그인 링크를 받아 대시보드/웹 채팅을 사용한다.
- 같은 서버에서 팀이 중복 생성되지 않도록 막는다.

### 대화 참여
- **멘션하면 무조건 답변** — `@TORO`를 부르면 바로 응답한다.
- **직접 질문** — `/ask`로 TORO에게 바로 질문한다.
- **팀 미가입 안내** — 팀이 없거나 로그인하지 않은 사용자는 `/ask`에서 가입/로그인 방법을 안내받는다.
- **알아서 끼어들기** — AI가 대화 흐름을 보고 끼어들 타이밍을 판단한다.
- **대화 기억** — 채널별 최근 메시지와 저장된 대화/메모를 바탕으로 맥락을 유지한다.
- **응답 모드** — 자동(AI 판단) / 간격(타이머+메시지 수) / 음소거.
- **멘션 자동 변환** — 봇이 `@유저이름`을 실제 Discord 멘션으로 변환한다.

### 메모와 저장된 대화
- `/memo`로 팀 메모를 저장한다.
- 대화 기록은 팀 단위로 저장된다.
- 웹 대시보드의 `/admin/stored`에서 저장된 메모와 대화 기록을 확인할 수 있다.

### Google Calendar 연동
- 팀 단위로 Google Calendar OAuth를 연결한다.
- OAuth callback은 Google redirect가 막히지 않도록 public endpoint로 열려 있다.
- OAuth state는 서명·만료 검증을 거치며, callback 시 팀 관리자 권한도 다시 확인한다.

### 음악 재생
- `/play`로 YouTube 검색 후 결과에서 선택한다.
- URL 직접 입력 가능.
- `/skip`, `/stop`, `/pause`로 재생을 제어한다.
- `/queue`, `/remove`, `/nowplaying`으로 대기열을 관리한다.
- `/volume`으로 볼륨을 조절한다. 기본값은 30%다.
- `/autoplay`로 YouTube Radio Mix 기반 자동 추천을 켠다.
- 봇 프로필에 현재 재생 중인 곡을 표시한다.
- 15분 길이 제한, 유저가 전부 나가면 즉시 퇴장한다.

### 성격 프리셋
- `/mode`로 여러 성격/말투를 전환한다.
- 기본 제공: 건방진 고양이(냥체), 친구 말투 모사 등.
- 커스텀 프리셋 추가/편집/순서 변경과 프리셋별 기본 음성을 지원한다.

### AI 이미지 생성
- `/draw`로 텍스트 프롬프트를 이미지로 생성한다.
- Google image-capable Gemini 모델을 사용한다.
- 기본값:
  - `GOOGLE_IMAGE_MODEL_FLASH=gemini-2.5-flash-image-preview`
  - `GOOGLE_IMAGE_MODEL_PRO=gemini-2.5-flash-image-preview`
- `.env`에서 모델명을 바꿀 수 있다.

### 음성 답변 (TTS)
- `/say`로 캐릭터 말투 답변과 음성 파일을 받는다.

### 대화 요약
- `/summary`로 최근 대화를 주제별로 정리한다.

### 유저 기억 / Obsidian 연동
- 대화에서 유저 정보를 자동 추출·기록한다.
- `[[Obsidian 링크]]`로 그래프 뷰 연결이 가능하다.
- `/내정보`로 봇이 기억하는 내 정보를 확인한다.
- 음악 검색 관련 내용은 기억에 저장하지 않는다.

### 이미지 인식 / 링크 읽기
- Discord 이미지 첨부 시 AI가 이미지를 인식하고 반응한다.
- URL 공유 시 내용을 읽어 대화 맥락에 반영한다.

## 슬래시 명령어

| 명령어 | 설명 |
|--------|------|
| `/team create` | 현재 Discord 서버의 TORO 팀 생성 |
| `/team info` | 현재 서버의 팀 정보 확인 |
| `/team invite` | 팀 초대 코드 발급 |
| `/login` | 웹 로그인 링크 발급 |
| `/ask` | TORO에게 직접 질문 |
| `/memo` | 팀 메모 저장 |
| `/mode` | 성격 프리셋 보기/변경 |
| `/draw` | AI 이미지 생성 |
| `/say` | 음성으로 답변 (TTS) |
| `/summary` | 최근 대화 요약 |
| `/reply` | 응답 모드 변경 |
| `/mute` | 채널 임시 음소거 |
| `/mute-status` | 음소거 남은 시간 확인 |
| `/내정보` | 봇이 기억하는 내 정보 확인 |
| `/status` | 봇 상태 확인 |
| `/play` | YouTube 음악 검색/재생 |
| `/skip` | 현재 곡 스킵 |
| `/stop` | 음악 정지 + 퇴장 |
| `/pause` | 일시정지/재개 |
| `/queue` | 대기열 보기 |
| `/nowplaying` | 현재 곡 정보 |
| `/remove` | 대기열에서 곡 제거 |
| `/volume` | 볼륨 조절 (0~100%) |
| `/autoplay` | 자동 추천 재생 |

## 웹 서비스

### 웹 채팅 (`/chat`)
- Discord 없이 웹에서 캐릭터와 대화한다.
- 카카오톡 스타일 UI와 모바일 화면을 지원한다.
- 프리셋 캐릭터를 선택해서 대화할 수 있다.

### 관리자 대시보드 (`/admin`)
- 실시간 통계, 유저 랭킹, 트렌딩 키워드.
- 날짜별 메시지/이벤트/에러 로그.
- AI 모델, 응답 모드, 프리셋, 임베딩 모델, API 키, RAG 메모리 관리.
- Google Calendar 연동 관리.
- 실시간 봇 테스트 채팅.

### 저장 데이터 확인 (`/admin/stored`)
- 팀별 저장 메모 확인.
- 작성자 Discord user id와 저장 시각 확인.
- 팀별 conversation history 확인.
- 최근 대화 메시지 확인.

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Node.js + TypeScript + Express |
| Frontend | React 19 + Vite |
| Discord | discord.js v14 |
| DB/ORM | SQLite + Prisma |
| AI | Google Gemini / OpenAI GPT / Anthropic Claude |
| 벡터 검색 | Vectra |
| 음악 | @discordjs/voice + yt-dlp + FFmpeg |
| 유저 기억 | Obsidian 볼트 (.md 파일) |
| 배포 | Docker / Docker Compose |

## 설치

```bash
git clone https://github.com/0yeonnnn0/toro_bot.git
cd toro_bot
npm install
cd frontend && npm install && npm run build && cd ..
npx prisma generate
```

## 환경변수

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `DISCORD_TOKEN` | Discord 봇 토큰 |
| `OWNER_ID` | 봇 주인 Discord ID |
| `DASHBOARD_PORT` | 웹 서버 포트. 기본 `3000` |
| `DASHBOARD_SECRET` | 관리자 대시보드 비밀번호 |
| `DATABASE_URL` | Prisma DB URL. Docker 기본값은 `file:/app/data/toro.db` |
| `AI_PROVIDER` | `google` / `openai` / `anthropic` |
| `GOOGLE_API_KEY` | Google AI API 키 |
| `GOOGLE_MODEL` | Google 텍스트 모델 |
| `GOOGLE_IMAGE_MODEL_FLASH` | `/draw` Flash 이미지 모델 |
| `GOOGLE_IMAGE_MODEL_PRO` | `/draw` Pro 이미지 모델 |
| `OPENAI_API_KEY` | OpenAI API 키 |
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `TOKEN_ENCRYPTION_KEY` | OAuth token 암호화 키 |
| `GOOGLE_CLIENT_ID` | Google Calendar OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Google Calendar OAuth callback URL |
| `TORO_DEFAULT_TEAM_MODE` | 팀 사용 정책. 기본 `required` |
| `TORO_ALLOW_AUTO_TEAM_CREATE` | 자동 팀 생성 허용 여부 |

비밀값은 README나 git에 커밋하지 말고 `.env`에만 둔다.

## 실행

### 로컬 개발

```bash
npm run db:dev
npm run dev
```

### 로컬 프로덕션 빌드

```bash
npm run db:migrate
npm run build
npm start
```

### Docker 개발

```bash
npm run docker:dev
```

`docker-compose.dev.yml`은 다음을 수행한다.
- `npx prisma migrate deploy`
- `npm run dev`
- `./src`, `./prisma`, `./data`를 컨테이너에 마운트
- 개발 DB: `file:/app/data/toro-dev.db`

### Docker 검증

```bash
npm run docker:test
```

컨테이너 안에서 migration, typecheck, test, build를 순서대로 실행한다.

### Docker 운영

```bash
npm run docker:prod
```

또는 직접:

```bash
docker compose up --build -d
```

운영 컨테이너 시작 시 Prisma는 `prisma migrate deploy`를 사용한다.
`prisma db push`는 운영 시작 경로에서 사용하지 않는다.

## 기본 사용 흐름

1. Discord 서버에 TORO 봇을 초대한다.
2. 서버 관리자 또는 봇 주인이 `/team create`를 실행한다.
3. 필요한 멤버에게 `/team invite`로 초대 코드를 공유한다.
4. 사용자는 `/login`으로 웹 로그인 링크를 받는다.
5. `/ask`, `/memo`, `/draw`, `/play` 등 기능을 사용한다.
6. 웹에서는 `/admin`으로 설정을 관리하고 `/admin/stored`에서 저장된 메모/대화를 확인한다.

## 검증 명령

```bash
npx prisma validate
npm run typecheck
npm test
npm run build
cd frontend && npm run build
npm audit --omit=dev
npm audit
cd frontend && npm audit
```

## 운영 주의사항

- 같은 Discord 서버에는 하나의 팀만 생성할 수 있다.
- 기존 DB에 동일한 `guildId`를 가진 팀이 중복으로 있으면 unique migration이 실패할 수 있다. 배포 전 중복 데이터를 정리한다.
- Google Calendar OAuth callback URL은 Google Cloud Console에 등록된 redirect URI와 `.env`의 `GOOGLE_REDIRECT_URI`가 일치해야 한다.
- `/api/calendar/oauth/callback`은 public endpoint지만, signed state와 팀 관리자 권한 검증을 통과해야 연결된다.
- `/admin`과 `/api/stored/*`는 `DASHBOARD_SECRET` 기반 인증이 필요하다.
