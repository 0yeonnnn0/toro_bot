import fs from "fs";
import path from "path";
import { callAI } from "./ai";
import type { HistoryMessage } from "./history";

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, "../../data/vault");
const TORO_DIR = path.join(VAULT_PATH, "TORO");
const USERS_DIR = path.join(TORO_DIR, "users");

export interface UserIdentity {
  discordUserId: string;
  displayName: string;
}

// ── Init ──
export function initVault(): void {
  for (const dir of [TORO_DIR, USERS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`볼트 경로: ${VAULT_PATH}`);
}

// ── User Note CRUD ──
function safeFileName(value: string): string {
  return value.replace(/[/\\:*?"<>|]/g, "_");
}

function userNotePath(identity: UserIdentity): string {
  return path.join(USERS_DIR, `${safeFileName(identity.discordUserId)}.md`);
}

function legacyUserNotePath(displayName: string): string {
  return path.join(USERS_DIR, `${safeFileName(displayName)}.md`);
}

function upsertFrontmatterField(frontmatter: string, key: string, value: string): string {
  const line = `${key}: ${JSON.stringify(value)}`;
  const regex = new RegExp(`^${key}:\\s*.*$`, "m");
  if (regex.test(frontmatter)) return frontmatter.replace(regex, line);
  return `${frontmatter.trimEnd()}\n${line}`;
}

function ensureUserNoteIdentity(content: string, identity: UserIdentity, date = new Date().toISOString().slice(0, 10)): string {
  let body = content;
  let frontmatter = "";
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (match) {
    frontmatter = match[1];
    body = content.slice(match[0].length);
  } else {
    frontmatter = "tags: [toro/user]";
  }

  frontmatter = upsertFrontmatterField(frontmatter, "discordUserId", identity.discordUserId);
  frontmatter = upsertFrontmatterField(frontmatter, "displayName", identity.displayName);
  frontmatter = upsertFrontmatterField(frontmatter, "name", identity.displayName);
  frontmatter = upsertFrontmatterField(frontmatter, "updated", date);
  if (!/^tags:\s*/m.test(frontmatter)) frontmatter = `${frontmatter.trimEnd()}\ntags: [toro/user]`;

  const trimmedBody = body.trimStart();
  const updatedBody = /^#\s+.+$/m.test(trimmedBody)
    ? trimmedBody.replace(/^#\s+.+$/m, `# ${identity.displayName}`)
    : `# ${identity.displayName}\n\n${trimmedBody}`.trimEnd() + "\n";

  return `---\n${frontmatter.trimEnd()}\n---\n\n${updatedBody.trimEnd()}\n`;
}

function migrateLegacyNoteIfNeeded(identity: UserIdentity): void {
  const idPath = userNotePath(identity);
  if (fs.existsSync(idPath)) return;

  const legacyPath = legacyUserNotePath(identity.displayName);
  if (!fs.existsSync(legacyPath) || legacyPath === idPath) return;

  const migrated = ensureUserNoteIdentity(fs.readFileSync(legacyPath, "utf-8"), identity);
  fs.writeFileSync(idPath, migrated, "utf-8");
}

export function readUserNote(identity: UserIdentity): string {
  migrateLegacyNoteIfNeeded(identity);
  const fp = userNotePath(identity);
  if (!fs.existsSync(fp)) return "";

  const content = fs.readFileSync(fp, "utf-8");
  const updated = ensureUserNoteIdentity(content, identity);
  if (updated !== content) fs.writeFileSync(fp, updated, "utf-8");
  return updated;
}

export function writeUserNote(identity: UserIdentity, content: string): void {
  fs.writeFileSync(userNotePath(identity), ensureUserNoteIdentity(content, identity), "utf-8");
}

export function appendToUserNote(identity: UserIdentity, entry: string): void {
  const existing = readUserNote(identity);
  const date = new Date().toISOString().slice(0, 10);

  if (!existing) {
    const note = `---
discordUserId: ${JSON.stringify(identity.discordUserId)}
displayName: ${JSON.stringify(identity.displayName)}
name: ${JSON.stringify(identity.displayName)}
updated: ${date}
tags: [toro/user]
---

# ${identity.displayName}

## 기록
- ${entry}
`;
    writeUserNote(identity, note);
    return;
  }

  let updated = ensureUserNoteIdentity(existing, identity, date);
  const recordIdx = updated.indexOf("## 기록");
  if (recordIdx !== -1) {
    const insertAt = updated.indexOf("\n", recordIdx) + 1;
    updated = updated.slice(0, insertAt) + `- ${entry}\n` + updated.slice(insertAt);
  } else {
    updated += `\n## 기록\n- ${entry}\n`;
  }
  writeUserNote(identity, updated);
}

// ── AI Info Extraction ──
const EXTRACT_PROMPT = `너는 대화에서 특정 유저 한 명에 대한 정보를 추출하는 봇이야.
아래 대화를 보고 추출 대상 유저에 대해 새로 알게 된 사실이 있으면 추출해.

규칙:
- 추출 대상의 discordUserId와 displayName을 기준으로 대상 유저 한 명만 다뤄
- 다른 사람의 취향, 일정, 소유물, 경험, 감정은 절대 추출하지 마
- 다른 화자의 말은 대상 유저 발화 해석을 위한 맥락으로만 참고하고, 정보 출처로 쓰지 마
- 이미 기록된 정보는 절대 반복하지 마
- 사소한 건 무시 (인사, 감탄사, 농담 등)
- 음악 검색/재생 관련 내용은 무시 (노래 제목, /play, /skip 등 음악 커맨드)
- 의미 있는 사실만: 직업, 관심사, 일정, 근황, 취향, 소유물, 경험 등
- 각 사실은 한 줄로, "[날짜] 내용" 형식
- 핵심 키워드는 [[대괄호]]로 감싸서 Obsidian 링크로 만들어
  - 예: [2026-03-28] [[React]] 공부 중
  - 예: [2026-03-28] [[토스]] 면접 준비 중
  - 예: [2026-03-28] [[맥북 프로]] 새로 구매
- 링크 대상: 기술, 회사, 학교, 도구, 게임, 장소, 사람 이름 등 고유명사
- 일반 형용사나 동사는 링크하지 마 (공부 중, 힘들어함 등은 X)
- raw 대화 로그, 화자명 접두사, "참고:" 같은 메타 설명은 저장하지 마
- 새로운 사실이 없으면 정확히 "<NONE>"이라고만 답해
- 5개 이하로 추출해`;

function isTargetUserMessage(message: HistoryMessage, identity: UserIdentity): boolean {
  if (message.role !== "user") return false;
  if (message.discordUserId) return message.discordUserId === identity.discordUserId;
  if (message.displayName) return message.displayName === identity.displayName;
  return message.content.startsWith(`${identity.displayName}:`);
}

function buildExtractionHistory(identity: UserIdentity, history: HistoryMessage[]): HistoryMessage[] {
  return history.filter((message) => message.role === "assistant" || isTargetUserMessage(message, identity));
}

function isValidFactLine(line: string): boolean {
  if (!/^\[\d{4}-\d{2}-\d{2}\]\s+/.test(line)) return false;
  if (/^(참고|추출 대상|위 대화|대화|기록)[:：]/.test(line)) return false;
  if (/^[^\s:：]{1,24}[:：]\s*/.test(line.replace(/^\[\d{4}-\d{2}-\d{2}\]\s+/, ""))) return false;
  return true;
}

export async function extractAndSave(
  identity: UserIdentity,
  history: HistoryMessage[],
): Promise<string[]> {
  const existing = readUserNote(identity);
  const existingSection = existing ? `\n기존 기록:\n${existing}` : "";

  const date = new Date().toISOString().slice(0, 10);
  const prompt = `${EXTRACT_PROMPT}\n\n추출 대상:\n- discordUserId: ${identity.discordUserId}\n- displayName: ${identity.displayName}${existingSection}\n\n오늘 날짜: ${date}`;

  const extractionHistory = buildExtractionHistory(identity, history);
  if (extractionHistory.length === 0) return [];

  const result = await callAI(extractionHistory, prompt);
  if (result.trim() === "<NONE>" || result.includes("<NONE>")) return [];

  const facts = result
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").trim())
    .filter(l => l.length > 0 && !l.includes("<NONE>"))
    .filter(isValidFactLine);

  for (const fact of facts) {
    appendToUserNote(identity, fact);
  }

  return facts;
}

// ── Read vault notes for context ──
export function getUserContext(identity: UserIdentity): string {
  const note = readUserNote(identity);
  if (!note) return "";
  return `<user_profile name="${identity.displayName}" discordUserId="${identity.discordUserId}">\n${note}\n</user_profile>`;
}

// ── List all user notes ──
export function listUserNotes(): { name: string; path: string; size: number }[] {
  if (!fs.existsSync(USERS_DIR)) return [];
  return fs.readdirSync(USERS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const fp = path.join(USERS_DIR, f);
      const stat = fs.statSync(fp);
      return { name: f.replace(".md", ""), path: fp, size: stat.size };
    });
}

// ── Read arbitrary vault note ──
export function readVaultNote(relativePath: string): string {
  const fp = path.join(VAULT_PATH, relativePath);
  if (!fs.existsSync(fp)) return "";
  return fs.readFileSync(fp, "utf-8");
}

// ── Write arbitrary vault note ──
export function writeVaultNote(relativePath: string, content: string): void {
  const fp = path.join(VAULT_PATH, relativePath);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, content, "utf-8");
}

// ── Stats ──
export function getVaultStats(): { userNotes: number; vaultPath: string } {
  const notes = listUserNotes();
  return { userNotes: notes.length, vaultPath: VAULT_PATH };
}
