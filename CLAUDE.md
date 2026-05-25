# CLAUDE.md

Internal notes for contributors and agents. Use `README.md` as the public-facing documentation.

## Commands

```bash
# Backend
npm run dev          # tsx watch — hot-reload dev server
npm run build        # tsc → dist/
npm start            # node dist/index.js
npm test             # vitest run
npm run typecheck    # tsc --noEmit

# Frontend
cd frontend
npm run dev          # vite dev server
npm run build        # vite build → frontend/dist/

# Docker (local)
docker compose up -d

# NAS deploy — push to main triggers GitHub Actions → Docker Hub → Watchtower auto-pull
git push origin main
```

### CI/CD pipeline

`develop` → CI (typecheck + test + frontend build) → merge to `main` → Docker image build+push → Watchtower pulls on NAS automatically.

### Git branching

기능 개발 시 `develop`에서 직접 작업하지 말고, **기능별 브랜치를 새로 파서** 진행한다.

```bash
git checkout develop
git checkout -b feat/기능이름      # 브랜치 생성
# 작업 후
git push origin feat/기능이름
gh pr create --base develop        # develop으로 PR
# 머지 후 develop → main PR로 배포
```

브랜치 네이밍: `feat/기능`, `fix/버그`, `docs/문서`, `refactor/리팩토링`

## Important files

### Backend (`src/`)

- `src/index.ts` — entrypoint; boots RAG, vault, bot, and dashboard server
- `src/bot/client.ts` — Discord message handler, auto-participation logic (auto/interval/mute modes), mention handling, conversation buffer for RAG, image extraction
- `src/bot/ai.ts` — multi-provider AI calls (Anthropic/OpenAI/Google) with automatic fallback to `gemma-3-27b-it` on rate limits; exports `getReply()`, `judgeAndReply()`, `callAI()`
- `src/bot/commands.ts` — slash command definitions and handlers (`/ask`, `/mode`, `/draw`, `/say`, `/summary`, `/reply`, `/mute`, `/내정보`, `/status`)
- `src/bot/prompt.ts` — preset system; loads/saves presets from `data/presets.json`; builds system prompt with owner/user suffix based on `OWNER_ID`
- `src/bot/history.ts` — per-channel message history (max 30), in-memory only
- `src/bot/rag.ts` — vector search via vectra + Google `gemini-embedding-001`; stores conversation chunks, searches relevant context
- `src/bot/vault.ts` — Obsidian vault integration; reads/writes user `.md` notes in `VAULT_PATH/TORO/users/`; AI-driven info extraction from conversations with `[[Obsidian links]]` for keywords
- `src/bot/draw.ts` — Codex-first image generation for /draw, with OpenAI image API fallback
- `src/bot/tts.ts` — Google TTS with 6 voice options
- `src/bot/scrape.ts` — URL content extraction for AI context
- `src/bot/queue.ts` — concurrent request limiter (max 3), per-user cooldown (3s), queue timeout (15s)
- `src/shared/state.ts` — global state singleton; config, stats, logs, events, errors, user stats, keywords; auto-saves to `data/state.json` every 30s
- `src/shared/keys.ts` — API key masking utility
- `src/dashboard/server.ts` — Express server with auth (session-based, rate-limited login), serves frontend and API
- `src/dashboard/routes/api.ts` — REST API endpoints for dashboard
- `src/dashboard/chat-logs.ts` — web chat session log persistence

### Frontend (`frontend/src/`)

- `frontend/src/App.tsx` — router; public `/chat` + auth-gated `/admin/*`
- `frontend/src/main.tsx` — React root with `next-themes` ThemeProvider (light/dark)
- `frontend/src/pages/Dashboard.tsx` — overview with live stats, user ranking, trending keywords
- `frontend/src/pages/Settings.tsx` — 3-tab settings (AI config, prompt presets, RAG memory); includes floating live test chat
- `frontend/src/pages/Logs.tsx` — 4-tab log viewer (messages, web chat, events, errors) with pagination
- `frontend/src/pages/Login.tsx` — password login
- `frontend/src/pages/Chat.tsx` — KakaoTalk-style public web chat with character selection
- `frontend/src/components/Nav.tsx` — sticky nav with online indicator + theme toggle
- `frontend/src/style.css` — full design system; CSS custom properties for light/dark theming; Toss-inspired clean design; responsive breakpoints at 768/600/375px

### Config & Data

- `.env` — secrets and config (never committed)
- `data/state.json` — runtime state (config, stats, logs) — auto-saved
- `data/presets.json` — custom preset overrides (merged with code defaults)
- `data/active-preset.json` — current active preset ID
- `data/preset-order.json` — preset display order
- `data/vectors/` — vectra index files for RAG
- `Dockerfile` — multi-stage build (frontend → backend → production alpine)
- `.github/workflows/ci.yml` — typecheck + test + frontend build on push
- `.github/workflows/deploy.yml` — Docker Hub push on main branch

## Architecture notes

### Message flow

```
Discord message → client.ts
  ├─ bot message → ignore
  ├─ !모드 command → preset change
  │
  ├─ add to history + stats + keyword tracking + RAG buffer
  │
  ├─ @mention → immediate reply (RAG + URL scrape + vault context)
  │
  └─ replyMode check:
      ├─ "mute" → skip
      ├─ "auto" → 30s cooldown → AI judge (judgeAndReply)
      └─ "interval" → timer OR message count → AI judge
          │
          └─ AI responds or returns "<SKIP>"
```

### AI provider system

- `callAI()` is the single entry point; dispatches to Anthropic/OpenAI/Google based on `state.config.aiProvider`
- On 429/quota/500/503 errors, automatically falls back to `gemma-3-27b-it` (free Google model)
- System prompt is built from active preset + owner/user suffix + RAG context + vault user profile

### Vault integration

- Bot writes to `VAULT_PATH/TORO/users/{displayName}.md` with Obsidian-compatible frontmatter
- After each reply, background task extracts user facts via AI and appends to user note
- Facts use `[[Obsidian links]]` for entity keywords (companies, tech, tools, etc.)
- Vault path is mounted into Docker container; NAS ↔ Mac synced via Syncthing, iOS via iCloud
- Docker volume: `/volume1/obsidian-vault/init/TORO:/vault/TORO` (TORO folder only for security)

### Preset system

- Default presets are hardcoded in `prompt.ts` (neko, yeonnnn, youngjun)
- Custom presets stored in `data/presets.json`, merged with defaults on startup
- Each preset has: `prompt`, `ownerSuffix`, `userSuffix`, `voice`, `enabled`
- `OWNER_ID` env var determines which suffix to append

### RAG pipeline

- Conversations buffered per-channel (5 messages) → embedded via `gemini-embedding-001` → stored in vectra index
- On reply, query vector search (top 3, score > 0.5) → formatted as XML `<past_conversation>` context
- Hit counts tracked in `data/rag-hits.json` for analytics

### Queue & rate limiting

- Max 3 concurrent AI requests globally
- Per-user cooldown: 3 seconds between replies
- Queue timeout: 15 seconds (stale requests dropped)

### Frontend theming

- `next-themes` with class strategy (`html.dark`)
- CSS custom properties in `:root` (light) and `.dark` (dark)
- Accent: `#3182f6` (light) / `#4c9aff` (dark) — Toss blue
- KakaoTalk chat page (`/chat`) has its own hardcoded light theme, independent of admin theme

### State persistence

- `state.ts` auto-saves to `data/state.json` every 30 seconds
- Graceful shutdown saves on SIGTERM/SIGINT
- Config changes from dashboard are written to state immediately
- Presets saved separately in `data/presets.json`

## Coding guidelines

### Think before coding
- 불확실하면 가정을 명시하고 물어볼 것. 여러 해석이 가능하면 조용히 하나 고르지 말고 제시.
- 더 간단한 방법이 있으면 말할 것. 필요하면 pushback.

### Simplicity first
- 요청한 것만 구현. 추측성 기능, 단일 사용 추상화, 불필요한 에러 핸들링 금지.
- 200줄이 50줄로 가능하면 다시 쓸 것.

### Surgical changes
- 요청과 직접 관련된 라인만 변경. 주변 코드 "개선", 리팩토링, 포매팅 금지.
- 내 변경으로 생긴 unused import/변수만 제거. 기존 dead code는 언급만.
- 기존 코드 스타일 따를 것.

### Goal-driven execution
- 작업을 검증 가능한 목표로 변환: "버그 수정" → "재현 테스트 작성 후 통과시키기"
- 멀티스텝 작업은 간단한 계획 작성: `[단계] → verify: [확인 방법]`

## Conventions

- Korean comments/logs for internal messages; English for code identifiers
- Toast notifications via `sonner` for user feedback
- API errors: return `{ error: string }` with appropriate HTTP status
- All AI calls go through `callAI()` — never call provider APIs directly
- Inline styles in React only when truly dynamic; prefer CSS classes in `style.css`
- Test files colocated: `foo.ts` → `foo.test.ts`

## NAS deployment

- Synology NAS running Docker (Container Manager)
- Bot container: `dusehd1/toro-bot:latest`
- Watchtower container auto-pulls new images
- Volumes: `./data:/app/data` + vault TORO mount
- Syncthing container syncs Obsidian vault between NAS ↔ Mac
- WebDAV server for iOS Obsidian (Remotely Save plugin) — currently unused, using iCloud relay instead
- Hyper Backup runs daily vault backups

## Open questions

- Embedding model: `gemini-embedding-001` 사용 중 (`text-embedding-004`는 deprecated)
- iOS vault sync: Remotely Save + WebDAV failed; using iCloud ↔ Mac ↔ Syncthing ↔ NAS relay (requires Mac to be on)
- Consider daily conversation summary notes in `TORO/daily/` for long-term memory
- Consider user relationship mapping for richer social context
- RAG hit tracking exists but isn't surfaced in vault notes yet
