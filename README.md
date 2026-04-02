# TORO

친구들 디스코드 서버에 상주하며 자연스럽게 대화에 끼어드는 AI 봇.
단순한 명령어 봇이 아니라, 대화 흐름을 읽고 적절한 타이밍에 반응한다.

## 핵심 기능

### 대화 참여
- **멘션하면 무조건 답변** — `@TORO` 부르면 바로 응답
- **알아서 끼어들기** — AI가 대화 흐름을 보고 끼어들 타이밍을 스스로 판단
- **대화 기억** — 채널별 최근 30개 메시지 + 과거 대화 벡터 검색(RAG)
- **응답 모드** — 자동(AI 판단) / 간격(타이머+메시지 수) / 음소거
- **멘션 자동 변환** — 봇이 `@유저이름`을 진짜 디스코드 멘션으로 변환

### 음악 재생
- `/play` 로 유튜브 검색 → 5개 결과에서 선택 (페이지네이션, 최대 15개)
- URL 직접 입력 가능 (플레이리스트/라디오 URL 자동 정리)
- `/skip`, `/stop`, `/pause` — 재생 컨트롤
- `/queue`, `/remove`, `/nowplaying` — 대기열 관리
- `/autoplay` — YouTube Radio Mix 기반 자동 추천 + 장르 선택 (K-Pop, Lofi, Jazz 등)
- 유튜브 자체 추천 알고리즘 활용, 한국 음악 추천 강함
- 3곡씩 미리 채움, 대기열 1곡 이하면 자동 보충
- 유저가 추가한 곡은 autoplay 곡보다 우선 재생
- 제목 중복 방지, 15분 길이 제한, 5분 유휴 시 자동 퇴장
- 검색 결과는 본인만 보임, 재생 알림은 모두에게 표시

### 성격 프리셋
- 여러 성격/말투를 자유롭게 전환 (`/mode`)
- 기본 제공: 건방진 고양이(냥체), 친구 말투 모사 등
- 커스텀 프리셋 추가/편집/순서 변경, 프리셋별 기본 음성

### AI 이미지 생성
- `/draw` 로 텍스트 → 이미지 생성 (Flash / Pro)

### 음성 답변 (TTS)
- `/say` → 봇이 캐릭터 말투로 답변 + 음성 파일 첨부 (6종 목소리)

### 대화 요약
- `/summary` → 최근 대화를 주제별로 정리

### 유저 기억 (Obsidian 볼트 연동)
- 대화에서 유저 정보를 자동 추출·기록 (직업, 관심사, 근황 등)
- `[[Obsidian 링크]]`로 그래프 뷰 연결
- `/내정보` 로 봇이 기억하는 정보 확인
- 음악 검색 관련 내용은 기록하지 않음

### 이미지 인식 / 링크 읽기
- 디스코드 이미지 첨부 시 AI가 인식하고 반응
- URL 공유 시 내용 크롤링해서 대화에 반영

### 환영 인사
- 새 멤버 입장 시 캐릭터 말투로 자동 환영

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
| `/mute-status` | 음소거 남은 시간 확인 |
| `/내정보` | 봇이 기억하는 내 정보 확인 |
| `/status` | 봇 상태 확인 |
| `/play` | 유튜브 음악 검색/재생 |
| `/skip` | 현재 곡 스킵 |
| `/stop` | 음악 정지 + 퇴장 |
| `/pause` | 일시정지/재개 |
| `/queue` | 대기열 보기 |
| `/nowplaying` | 현재 곡 정보 |
| `/remove` | 대기열에서 곡 제거 |
| `/autoplay` | 자동 추천 재생 (장르 선택 가능) |

## 웹 서비스

### 웹 채팅 (`/chat`)
- 디스코드 없이 웹에서 캐릭터와 대화
- 카카오톡 스타일 UI, 모바일 지원 (PWA)
- 모든 프리셋 캐릭터를 선택해서 대화 가능

### 관리자 대시보드 (`/admin`)
- 실시간 통계, 유저 랭킹, 트렌딩 키워드
- 날짜별 메시지/이벤트/에러 로그 (무제한 보존)
- AI 모델, 응답 모드, 프리셋, 임베딩 모델, API 키, RAG 메모리 관리
- 라이트/다크 모드 (토스 스타일), 모바일 반응형
- 실시간 봇 테스트 채팅 (플로팅 위젯)

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Node.js + TypeScript + Express |
| Frontend | React 19 + Vite + next-themes |
| Discord | discord.js v14 |
| AI | Google Gemini / OpenAI GPT / Anthropic Claude |
| 벡터 검색 | Vectra (text-embedding-004) |
| 음악 | @discordjs/voice + yt-dlp + FFmpeg |
| 유저 기억 | Obsidian 볼트 (.md 파일) |
| 배포 | Docker + Watchtower (자동 업데이트) |
| 인프라 | Synology NAS + Syncthing + iCloud |

## 인프라 구조

```
아이폰/아이패드 ←→ iCloud ←→ 맥 ←→ Syncthing ←→ NAS (마스터)
                                                    ↑
                                               TORO 봇 (/vault)
                                                    ↑
                                              Hyper Backup (매일)
```

- Synology NAS에서 Docker로 운영
- Watchtower로 Docker Hub 이미지 자동 업데이트
- Obsidian 볼트: NAS(마스터) ↔ Syncthing ↔ Mac ↔ iCloud ↔ iOS
- Hyper Backup으로 볼트 매일 백업

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
