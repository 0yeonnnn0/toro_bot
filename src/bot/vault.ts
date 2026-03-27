import fs from "fs";
import path from "path";
import { callAI } from "./ai";
import type { HistoryMessage } from "./history";

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, "../../data/vault");
const TORO_DIR = path.join(VAULT_PATH, "TORO");
const USERS_DIR = path.join(TORO_DIR, "users");

// ── Init ──
export function initVault(): void {
  for (const dir of [TORO_DIR, USERS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`볼트 경로: ${VAULT_PATH}`);
}

// ── User Note CRUD ──
function userNotePath(displayName: string): string {
  const safe = displayName.replace(/[/\\:*?"<>|]/g, "_");
  return path.join(USERS_DIR, `${safe}.md`);
}

export function readUserNote(displayName: string): string {
  const fp = userNotePath(displayName);
  if (!fs.existsSync(fp)) return "";
  return fs.readFileSync(fp, "utf-8");
}

export function writeUserNote(displayName: string, content: string): void {
  fs.writeFileSync(userNotePath(displayName), content, "utf-8");
}

export function appendToUserNote(displayName: string, entry: string): void {
  const existing = readUserNote(displayName);
  const date = new Date().toISOString().slice(0, 10);

  if (!existing) {
    // Create new note with frontmatter
    const note = `---
name: ${displayName}
updated: ${date}
tags: [toro/user]
---

# ${displayName}

## 기록
- ${entry}
`;
    writeUserNote(displayName, note);
    return;
  }

  // Update the 'updated' date in frontmatter
  let updated = existing.replace(/^(updated:\s*).+$/m, `$1${date}`);
  // Append to 기록 section
  const recordIdx = updated.indexOf("## 기록");
  if (recordIdx !== -1) {
    const insertAt = updated.indexOf("\n", recordIdx) + 1;
    updated = updated.slice(0, insertAt) + `- ${entry}\n` + updated.slice(insertAt);
  } else {
    updated += `\n## 기록\n- ${entry}\n`;
  }
  writeUserNote(displayName, updated);
}

// ── AI Info Extraction ──
const EXTRACT_PROMPT = `너는 대화에서 유저 정보를 추출하는 봇이야.
아래 대화를 보고 유저에 대해 새로 알게 된 사실이 있으면 추출해.

규칙:
- 이미 기록된 정보는 절대 반복하지 마
- 사소한 건 무시 (인사, 감탄사, 농담 등)
- 의미 있는 사실만: 직업, 관심사, 일정, 근황, 취향, 소유물, 경험 등
- 각 사실은 한 줄로, "[날짜] 내용" 형식
- 새로운 사실이 없으면 정확히 "<NONE>"이라고만 답해
- 5개 이하로 추출해`;

export async function extractAndSave(
  displayName: string,
  history: HistoryMessage[],
): Promise<string[]> {
  const existing = readUserNote(displayName);
  const existingSection = existing ? `\n기존 기록:\n${existing}` : "";

  const date = new Date().toISOString().slice(0, 10);
  const prompt = `${EXTRACT_PROMPT}${existingSection}\n\n오늘 날짜: ${date}`;

  const result = await callAI(history, prompt);
  if (result.trim() === "<NONE>" || result.includes("<NONE>")) return [];

  const facts = result
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").trim())
    .filter(l => l.length > 0 && !l.includes("<NONE>"));

  for (const fact of facts) {
    appendToUserNote(displayName, fact);
  }

  return facts;
}

// ── Read vault notes for context ──
export function getUserContext(displayName: string): string {
  const note = readUserNote(displayName);
  if (!note) return "";
  return `<user_profile name="${displayName}">\n${note}\n</user_profile>`;
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
