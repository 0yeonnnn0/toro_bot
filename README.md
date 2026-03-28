# TORO

친구들 디스코드 서버에 상주하며 자연스럽게 대화에 끼어드는 AI 봇.
단순한 명령어 봇이 아니라, 대화 흐름을 읽고 적절한 타이밍에 반응한다.

## 핵심 기능

### 대화 참여
- **멘션하면 무조건 답변** — `@TORO` 부르면 바로 응답
- **알아서 끼어들기** — AI가 대화 흐름을 보고 끼어들 타이밍을 스스로 판단. 두 사람이 티키타카 중이면 조용히 있고, 질문이 허공에 뜨면 끼어듦
- **대화 기억** — 채널별로 최근 대화를 기억하고, 과거 대화도 벡터 검색으로 떠올림

### 성격 프리셋
- 여러 성격/말투를 자유롭게 전환 가능
- 기본 제공: 건방진 고양이(냥체), 친구 말투 모사 등
- 커스텀 프리셋 추가/편집/순서 변경 지원
- `/mode` 명령어로 즉시 전환

### AI 이미지 생성
- `/draw 고양이가 코딩하는 모습` 같이 텍스트로 이미지 생성
- Flash(빠름) / Pro(고품질) 모델 선택

### 음성 답변 (TTS)
- `/say 오늘 날씨 어때?` → 봇이 캐릭터 말투로 답변 + 음성 파일 첨부
- 6종 목소리 선택 가능, 프리셋별 기본 목소리 설정

### 대화 요약
- `/summary` → 최근 대화를 주제별로 정리해서 요약

### 유저 기억
- 대화하면서 유저 정보를 자동으로 파악하고 기록 (직업, 관심사, 근황 등)
- `/내정보` 로 봇이 나에 대해 뭘 알고 있는지 확인
- 다음 대화할 때 기억한 정보를 자연스럽게 활용

### 이미지 인식
- 디스코드에 사진 올리면 AI가 이미지를 보고 반응

### 링크 읽기
- 누가 URL 공유하면 내용을 크롤링해서 대화에 반영

### 응답 모드
| 모드 | 설명 |
|------|------|
| 자동 | AI가 알아서 판단 (기본) |
| 간격 | 일정 시간/메시지 수마다 반응 |
| 음소거 | 멘션만 응답, 자동 참여 OFF |

## 슬래시 명령어

| 명령어 | 설명 |
|--------|------|
| `/ask` | 봇에게 직접 질문 |
| `/mode` | 성격 프리셋 보기/변경 |
| `/draw` | AI 이미지 생성 |
| `/say` | 음성으로 답변 (TTS) |
| `/summary` | 최근 대화 요약 |
| `/reply` | 응답 모드 변경 |
| `/mute` | 채널 임시 음소거 |
| `/내정보` | 봇이 기억하는 내 정보 확인 |
| `/status` | 봇 상태 확인 |

## 웹 서비스

### 웹 채팅 (`/chat`)
- 디스코드 없이 웹에서 캐릭터와 대화
- 카카오톡 스타일 UI, 모바일 지원 (PWA)
- 모든 프리셋 캐릭터를 선택해서 대화 가능

### 관리자 대시보드 (`/admin`)
- **Overview** — 실시간 통계, 유저 랭킹, 트렌딩 키워드
- **Logs** — 메시지/이벤트/에러 로그 뷰어
- **Settings** — AI 모델, 응답 모드, 프리셋 편집, API 키 관리, RAG 메모리 관리
- **Live Test** — 플로팅 채팅으로 실시간 봇 테스트

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Node.js + TypeScript + Express |
| Frontend | React 19 + Vite |
| Discord | discord.js v14 |
| AI | Google Gemini / OpenAI GPT / Anthropic Claude |
| 벡터 검색 | Vectra |
| 배포 | Docker + Watchtower (자동 업데이트) |

## 설치

```bash
git clone https://github.com/0yeonnnn0/discord_bot.git
cd discord_bot
npm install
cd frontend && npm install && npm run build && cd ..
```

### 환경변수

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `DISCORD_TOKEN` | Discord 봇 토큰 |
| `OWNER_ID` | 봇 주인 Discord ID |
| `AI_PROVIDER` | `google` / `openai` / `anthropic` |
| `GOOGLE_API_KEY` | Google AI API 키 |
| `DASHBOARD_SECRET` | 대시보드 비밀번호 |
| `VAULT_PATH` | 유저 정보 저장 경로 |

### 실행

```bash
# 개발
npm run dev

# 프로덕션
npm run build && npm start

# Docker
docker compose up -d
```
