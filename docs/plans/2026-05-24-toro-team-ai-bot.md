# TORO Team AI Bot Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Rebuild TORO into a Docker-deployable Discord-native team AI bot with team subscriptions, shared GPT chat, existing music features, team Google Calendar, and team memo storage.

**Architecture:** Keep TORO as the Discord application shell instead of forking Hermes directly. Add a team-scoped persistence layer, route every AI/tool action through `teamId`, keep mention chat in-channel without creating threads, and implement calendar/memo as first-class TORO tools. Use Hermes concepts only where useful: provider-agnostic AI adapter, memory/tool routing, skill-like intent handlers, and safe home-server deployment boundaries.

**Tech Stack:** Node.js 22, TypeScript, discord.js v14, existing TORO music stack, SQLite + Prisma initially, Google Calendar API OAuth, Docker Compose, Vitest.

---

## Product Scope

### Required v3 Product Features

1. **Team subscription/login**
   - Users join a TORO team through Discord slash commands such as `/login`, `/team create`, `/team join`.
   - All persistent data is scoped by `teamId`.
   - MVP can treat “subscription” as local team membership, not paid billing.

2. **Shared GPT chat**
   - Any logged-in team member can use TORO by mentioning the bot or by `/ask`.
   - Mention replies stay in the same channel via normal Discord replies; TORO must not create threads.
   - Conversation history is scoped by `teamId + guildId + channelId`.

3. **Music**
   - Preserve existing `/play`, `/queue`, `/skip`, `/stop`, `/pause`, `/volume`, `/autoplay` behavior.
   - Make sure Docker image includes required voice/audio dependencies such as `ffmpeg` and `yt-dlp`.

4. **Team Google Calendar, 방식 A**
   - One team owner/admin connects one Google Calendar.
   - Logged-in team members use that shared team calendar from Discord.
   - Personal per-user calendar availability is explicitly out of MVP scope.

5. **Team memo/data storage**
   - Users can ask TORO in natural language to remember facts.
   - Example: `@toro 토로야 방금 @user1가 나한테 100만원 준다고 했다 메모좀`.
   - Memos are searchable by user, keyword, date, and team.

---

## Non-Goals for MVP

- Paid billing/subscription management.
- Personal Google Calendar availability merging.
- Full Hermes terminal/file/browser tool execution.
- Multi-platform gateway support outside Discord.
- Public SaaS multi-tenant hardening beyond home-server-safe team isolation.

---

## Current Codebase Notes

Existing useful files:

- Entry/server: `src/index.ts`, `src/bot/client.ts`, `src/dashboard/server.ts`
- Mention chat: `src/bot/message-handler.ts`
- AI provider adapter: `src/bot/ai.ts`
- Conversation history: `src/bot/history.ts`
- Runtime state: `src/shared/state.ts`, `data/state.json`
- Slash commands: `src/bot/commands/definitions.ts`, `src/bot/commands/index.ts`
- Music: `src/bot/music/*`, `src/bot/commands/music.ts`, `src/bot/commands/music-ui.ts`
- Docker: `Dockerfile`, `docker-compose.yml`, `.env.example`

Important existing behavior:

- Mention replies already use `message.reply(...)` and do not create threads.
- Current persistence is mostly JSON/file-state based and should not become the team DB.
- `data/state.json` is mutable runtime state and should be ignored for feature commits.

---

## Recommended Data Model

Use SQLite + Prisma for MVP.

```prisma
model Team {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  guildId   String?
  ownerId   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members       TeamMember[]
  invites       TeamInvite[]
  conversations Conversation[]
  memos         Memo[]
  calendar      TeamCalendarConnection?
}

model TeamMember {
  id            String   @id @default(cuid())
  teamId        String
  discordUserId String
  displayName   String
  role          TeamRole @default(MEMBER)
  createdAt     DateTime @default(now())

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([teamId, discordUserId])
  @@index([discordUserId])
}

model TeamInvite {
  id          String   @id @default(cuid())
  teamId      String
  code        String   @unique
  createdById String
  expiresAt   DateTime?
  usedAt      DateTime?
  createdAt   DateTime @default(now())

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
}

model Conversation {
  id        String   @id @default(cuid())
  teamId    String
  guildId   String?
  channelId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  team     Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  messages ConversationMessage[]

  @@unique([teamId, guildId, channelId])
}

model ConversationMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String
  discordUserId  String?
  displayName    String?
  content        String
  discordMessageId String?
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}

model Memo {
  id                   String   @id @default(cuid())
  teamId               String
  authorDiscordUserId  String
  subjectDiscordUserId String?
  content              String
  tags                 String   @default("[]")
  sourceGuildId        String?
  sourceChannelId      String?
  sourceMessageId      String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId, createdAt])
  @@index([teamId, subjectDiscordUserId])
}

model TeamCalendarConnection {
  id                         String   @id @default(cuid())
  teamId                     String   @unique
  googleAccountEmail          String?
  calendarId                 String
  encryptedRefreshToken       String
  connectedByDiscordUserId    String
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
}

enum TeamRole {
  OWNER
  ADMIN
  MEMBER
  READONLY
}
```

---

## Environment Variables

Add to `.env.example`:

```env
# Database
DATABASE_URL=file:/app/data/toro.db

# Security
TOKEN_ENCRYPTION_KEY=replace_with_32_byte_base64_key

# Google Calendar OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback

# TORO team behavior
TORO_DEFAULT_TEAM_MODE=required
TORO_ALLOW_AUTO_TEAM_CREATE=false
```

---

## Implementation Tasks

### Task 1: Protect runtime state from commits

**Objective:** Prevent `data/state.json` from polluting feature branches.

**Files:**
- Modify: `.gitignore`

**Steps:**
1. Add `data/state.json` and `data/*.json` if appropriate, while preserving any intentional sample files.
2. Run `git status --short` and confirm runtime state no longer appears after `git rm --cached data/state.json` if it is currently tracked.
3. Commit: `chore: ignore runtime state files`.

**Verification:**

```bash
git status --short
```

Expected: no modified `data/state.json` entry.

---

### Task 2: Add Prisma + SQLite foundation

**Objective:** Introduce durable team-scoped database storage.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`
- Create: `src/db/team-store.ts`
- Test: `src/db/team-store.test.ts`

**Steps:**
1. Install dependencies: `npm install @prisma/client` and `npm install -D prisma`.
2. Add Prisma schema with Team, TeamMember, TeamInvite, Conversation, ConversationMessage, Memo, TeamCalendarConnection.
3. Add package scripts:
   - `db:generate`: `prisma generate`
   - `db:migrate`: `prisma migrate deploy`
   - `db:dev`: `prisma migrate dev`
4. Implement Prisma client singleton in `src/db/client.ts`.
5. Implement team CRUD helpers in `src/db/team-store.ts`.
6. Add Vitest coverage for create team, add member, duplicate member prevention.

**Verification:**

```bash
npx prisma generate
npm run typecheck
npm test -- src/db/team-store.test.ts
```

---

### Task 3: Add team context resolution

**Objective:** Every Discord action can resolve the active TORO team and membership.

**Files:**
- Create: `src/team/context.ts`
- Create: `src/team/errors.ts`
- Test: `src/team/context.test.ts`

**Behavior:**
- For guild messages, resolve active team by `guildId` or user membership.
- If user is not logged in, return a typed `TeamLoginRequiredError`.
- For DM, resolve by user’s default team or ask them to select one.

**Verification:**

```bash
npm test -- src/team/context.test.ts
npm run typecheck
```

---

### Task 4: Add `/login` and `/team` commands

**Objective:** Let users create/join/switch teams from Discord.

**Files:**
- Modify: `src/bot/commands/definitions.ts`
- Modify: `src/bot/commands/index.ts`
- Create: `src/bot/commands/team.ts`
- Test: `src/bot/commands/team.test.ts`

**Slash commands:**

```text
/login
/team create name:<name>
/team invite
/team join code:<invite-code>
/team switch team:<team-slug>
/team info
/team members
```

**MVP command semantics:**
- `/login`: explains current team status and next action.
- `/team create`: creates a team and makes caller OWNER.
- `/team invite`: OWNER/ADMIN creates an invite code.
- `/team join`: joins by invite code.
- `/team info`: shows current team.

**Verification:**

```bash
npm test -- src/bot/commands/team.test.ts
npm run typecheck
```

---

### Task 5: Team-scope mention chat history

**Objective:** Use `teamId + guildId + channelId` as the shared conversation key.

**Files:**
- Modify: `src/bot/message-handler.ts`
- Modify: `src/bot/history.ts` or replace with DB-backed history service
- Create: `src/ai/conversation-store.ts`
- Test: `src/ai/conversation-store.test.ts`

**Behavior:**
- If a non-logged-in user mentions TORO, reply with login instructions.
- If logged in, append user message to team conversation.
- Call existing `getReply` with recent team-scoped history.
- Reply in-channel using `message.reply`, not thread creation.
- Append assistant response to the same conversation.

**Verification:**

```bash
npm test -- src/ai/conversation-store.test.ts src/bot/history.test.ts
npm run typecheck
```

Manual check in Discord:

```text
@TORO 안녕
@TORO 방금 내가 뭐라고 했어?
```

Expected: second answer remembers the first message in the same channel/team.

---

### Task 6: Refactor AI core into tool-aware router

**Objective:** Keep normal GPT chat, but detect memo/calendar intents before plain chat.

**Files:**
- Create: `src/ai/router.ts`
- Create: `src/ai/intents.ts`
- Modify: `src/bot/ai.ts`
- Test: `src/ai/router.test.ts`

**Intent types:**

```ts
type ToroIntent =
  | { type: "chat" }
  | { type: "memo_create"; content: string; subjectDiscordUserId?: string; tags?: string[] }
  | { type: "memo_search"; query: string }
  | { type: "calendar_create"; title: string; startsAt: string; endsAt?: string }
  | { type: "calendar_list"; range: string };
```

**Implementation approach:**
- Start with deterministic Korean keyword heuristics for memo/calendar.
- Add LLM classification later only if heuristics become insufficient.
- Router receives team context, message, history, and returns final Discord reply text.

**Verification:**

```bash
npm test -- src/ai/router.test.ts
npm run typecheck
```

---

### Task 7: Implement team memo storage

**Objective:** Store and search natural-language team memos.

**Files:**
- Create: `src/tools/memo/memo-store.ts`
- Create: `src/tools/memo/memo-tool.ts`
- Test: `src/tools/memo/memo-tool.test.ts`

**Behavior:**
- Create memo from natural language.
- Preserve source message IDs and mentioned user IDs.
- Search by keyword and mentioned user.
- Return short Korean/TORO-style confirmation.

**Examples:**

```text
@toro 토로야 방금 @user1가 나한테 100만원 준다고 했다 메모좀
→ 메모해뒀다냥. @user1 관련 메모로 저장했다냥.

@toro @user1 관련 메모 보여줘
→ 최근 메모 목록 반환
```

**Verification:**

```bash
npm test -- src/tools/memo/memo-tool.test.ts
npm run typecheck
```

---

### Task 8: Add team Google Calendar connection, 방식 A

**Objective:** Let one OWNER/ADMIN connect one shared Google Calendar per team.

**Files:**
- Create: `src/tools/calendar/google-oauth.ts`
- Create: `src/tools/calendar/calendar-store.ts`
- Create: `src/tools/calendar/calendar-tool.ts`
- Modify: `src/dashboard/server.ts` or add OAuth routes under dashboard
- Modify: `src/bot/commands/definitions.ts`
- Create: `src/bot/commands/calendar.ts`
- Test: `src/tools/calendar/calendar-tool.test.ts`

**Slash commands:**

```text
/calendar connect
/calendar status
/calendar disconnect
/calendar list range:<오늘|이번주|다음주>
/calendar add title:<title> date:<date> time:<time>
```

**Natural-language mention examples:**

```text
@toro 내일 오후 3시에 회의 일정 추가해줘
@toro 이번주 일정 보여줘
```

**Security:**
- Store refresh token encrypted with `TOKEN_ENCRYPTION_KEY`.
- Only OWNER/ADMIN can connect/disconnect calendar.
- Logged-in MEMBER can list/add events in MVP.

**Verification:**

```bash
npm test -- src/tools/calendar/calendar-tool.test.ts
npm run typecheck
```

Manual OAuth check:

```text
/calendar connect
```

Expected: TORO returns a Google OAuth link, callback stores `calendarId` and encrypted refresh token.

---

### Task 9: Preserve and regression-test music

**Objective:** Ensure team features do not break existing DJ TORO music behavior.

**Files:**
- Existing: `src/bot/music/*`
- Existing: `src/bot/commands/music.ts`
- Test: existing and new music command tests if needed

**Steps:**
1. Keep music queue scoped by guild, not team, unless a real conflict appears.
2. Verify voice commands still work after command registration refactor.
3. Add Docker-level dependency check for `ffmpeg` and `yt-dlp`.

**Verification:**

```bash
npm test -- src/bot/queue.test.ts
npm run typecheck
```

Manual Discord check:

```text
/play lofi hiphop
/queue
/skip
/stop
```

---

### Task 10: Docker Compose production readiness

**Objective:** Make home-server deployment repeatable.

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.dockerignore`
- Modify: `.env.example`
- Create: `docs/deployment.md`

**Requirements:**
- Mount persistent data: `./data:/app/data`.
- Run Prisma migration before app start.
- Include `ffmpeg`, `yt-dlp`, and build artifacts.
- Healthcheck dashboard endpoint if available.
- `restart: unless-stopped`.

**Example Compose:**

```yaml
services:
  toro:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

**Verification:**

```bash
docker compose build
docker compose up -d
docker compose logs -f --tail=100
```

---

### Task 11: Dashboard/admin visibility

**Objective:** Expose team, memo, calendar, and AI status safely in existing dashboard.

**Files:**
- Modify: `src/dashboard/routes/status.ts`
- Create: `src/dashboard/routes/teams.ts`
- Create: `src/dashboard/routes/memos.ts`
- Optionally modify frontend pages

**MVP:**
- Show DB connection status.
- Show team count/member count.
- Show calendar connected/not connected per team.
- Show recent memo count.

**Verification:**

```bash
npm run build
npm run typecheck
```

---

### Task 12: End-to-end acceptance pass

**Objective:** Verify TORO behaves like a deployable team AI bot.

**Checklist:**
- `/team create` creates team.
- `/team invite` and `/team join` work.
- Non-member mention gets login instructions.
- Member mention gets GPT response in same channel without thread creation.
- Conversation history is shared in same team/channel.
- Memo creation/search works.
- Calendar connect/list/add works with one team calendar.
- Music still works.
- Docker compose starts on a clean home-server checkout.

**Commands:**

```bash
npm run typecheck
npm test
npm run build
cd frontend && npm run build
Docker_BUILDKIT=1 docker compose build
```

---

## Suggested Milestones

### Milestone 1: Team + DB foundation
Tasks 1-4.

### Milestone 2: Shared GPT chat
Tasks 5-6.

### Milestone 3: Memo tool
Task 7.

### Milestone 4: Calendar tool
Task 8.

### Milestone 5: Music + Docker release candidate
Tasks 9-12.

---

## Branch Strategy

- `v2.0_dj_toro`: preserved current DJ TORO baseline.
- `feat/toro-hermes-runtime`: active development branch for this plan.
- Merge into `main` only after Docker build, tests, and manual Discord smoke test pass.

---

## Open Decisions

1. Should one Discord guild map to exactly one default TORO team, or can one guild contain multiple TORO teams?
   - Recommended MVP: one default team per guild, with user-level team switching later.
2. Should normal non-mention messages be stored for memory?
   - Recommended MVP: no, only store messages in conversations where TORO is mentioned or commands are used.
3. Should calendar event deletion be available to members?
   - Recommended MVP: only OWNER/ADMIN can delete; MEMBER can add/list.
4. Should memo deletion exist in MVP?
   - Recommended MVP: `/memo delete id:<id>` owner/admin only, after search exposes IDs.

---

## Immediate Next Step

Start with Milestone 1. Do not touch music or calendar first. The team DB and login model must exist before every other feature, because all later data must be scoped by `teamId`.
