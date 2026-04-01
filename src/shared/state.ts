import fs from "fs";
import path from "path";
import { appendLog, migrateLogs } from "./log-store";

const DATA_DIR = path.join(__dirname, "../../data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const MAX_EVENTS = 100;
const SAVE_INTERVAL = 30000;

// ── Types ──
export interface LogEntry {
  timestamp: number;
  guild?: string;
  channel: string;
  author: string;
  content: string;
  botReplied: boolean;
  triggerReason: "mention" | "random" | null;
  botReply: string | null;
  responseTime: number | null;
  ragHits: number;
  error: string | null;
  model: string | null;
}

export interface EventEntry {
  timestamp: number;
  type: string;
  detail: string;
}

export interface ErrorEntry {
  timestamp: number;
  type: string;
  message: string;
  detail: string;
}

export interface UserStat {
  displayName: string;
  messages: number;
  gotReplies: number;
}

export type ReplyMode = "auto" | "interval" | "mute";

export interface Config {
  replyChance: number;
  aiProvider: string;
  model: string;
  replyMode: ReplyMode;
  judgeInterval: number;    // interval 모드: 타이머 (초)
  judgeThreshold: number;   // interval 모드: 메시지 수
  judgePrompt: string;      // auto 모드: AI 판단 프롬프트
  // 웹 채팅 설정
  webShowNickname: boolean;    // AI에게 닉네임 포함해서 보내기
  webSystemPrompt: string;     // 웹 채팅 전용 추가 프롬프트
  // 이미지 인식
  imageRecognition: boolean;
  // API 키 (웹에서 관리, .env fallback)
  googleApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  dashboardSecret?: string;
}

export interface State {
  config: Config;
  stats: {
    messagesProcessed: number;
    repliesSent: number;
    startedAt: number;
  };
  events: EventEntry[];
  errors: ErrorEntry[];
  userStats: Record<string, UserStat>;
  keywords: Record<string, number>;
}

// ── Load ──
function loadState(): Partial<State> | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      console.log("저장된 상태 복원 완료");
      return data;
    }
  } catch (err) {
    console.error("상태 복원 실패:", (err as Error).message);
  }
  return null;
}

const saved = loadState();

export const state: State = {
  config: {
    replyChance: saved?.config?.replyChance ?? 0.08,
    aiProvider: saved?.config?.aiProvider ?? (process.env.AI_PROVIDER || "google"),
    model: saved?.config?.model ?? (process.env.GOOGLE_MODEL || process.env.ANTHROPIC_MODEL || process.env.OPENAI_MODEL || "gemini-2.5-flash-lite"),
    replyMode: saved?.config?.replyMode ?? "auto",
    judgeInterval: saved?.config?.judgeInterval ?? 120,
    judgeThreshold: saved?.config?.judgeThreshold ?? 5,
    judgePrompt: saved?.config?.judgePrompt ?? "",
    webShowNickname: saved?.config?.webShowNickname ?? false,
    webSystemPrompt: saved?.config?.webSystemPrompt ?? "",
    imageRecognition: saved?.config?.imageRecognition ?? true,
    googleApiKey: saved?.config?.googleApiKey ?? (process.env.GOOGLE_API_KEY || ""),
    openaiApiKey: saved?.config?.openaiApiKey ?? (process.env.OPENAI_API_KEY || ""),
    anthropicApiKey: saved?.config?.anthropicApiKey ?? (process.env.ANTHROPIC_API_KEY || ""),
    dashboardSecret: saved?.config?.dashboardSecret ?? (process.env.DASHBOARD_SECRET || ""),
  },
  stats: {
    messagesProcessed: saved?.stats?.messagesProcessed ?? 0,
    repliesSent: saved?.stats?.repliesSent ?? 0,
    startedAt: Date.now(),
  },
  events: saved?.events ?? [],
  errors: saved?.errors ?? [],
  userStats: saved?.userStats ?? {},
  keywords: saved?.keywords ?? {},
};

// Migrate existing in-memory logs to file-based storage
if ((saved as any)?.logs?.length > 0) {
  migrateLogs((saved as any).logs);
}

// ── Save ──
export function saveState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      config: state.config,
      stats: { messagesProcessed: state.stats.messagesProcessed, repliesSent: state.stats.repliesSent },
      events: state.events,
      errors: state.errors,
      userStats: state.userStats,
      keywords: state.keywords,
    }));
  } catch (err) {
    console.error("상태 저장 실패:", (err as Error).message);
  }
}

setInterval(saveState, SAVE_INTERVAL);
process.on("SIGTERM", () => { saveState(); process.exit(0); });
process.on("SIGINT", () => { saveState(); process.exit(0); });

// ── Log ──
export function addLog(entry: Omit<LogEntry, "timestamp">): void {
  const logEntry: LogEntry = { timestamp: Date.now(), ...entry };
  appendLog(logEntry);
}

export function addEvent(type: string, detail: string = ""): void {
  state.events.push({ timestamp: Date.now(), type, detail });
  if (state.events.length > MAX_EVENTS) state.events.shift();
}

export function addError(type: string, message: string, detail: string = ""): void {
  state.errors.push({ timestamp: Date.now(), type, message, detail });
  if (state.errors.length > MAX_EVENTS) state.errors.shift();
}

// ── User tracking ──
export function trackUser(userId: string, displayName: string, botReplied: boolean): void {
  if (!state.userStats[userId]) {
    state.userStats[userId] = { displayName, messages: 0, gotReplies: 0 };
  }
  const user = state.userStats[userId];
  user.displayName = displayName;
  user.messages++;
  if (botReplied) user.gotReplies++;
}

// ── Keywords ──
const STOP_WORDS = new Set([
  "이", "그", "저", "것", "수", "등", "더", "좀", "잘", "못",
  "안", "걍", "ㅋㅋ", "ㅎㅎ", "ㅇㅇ", "ㄴㄴ", "ㄹㅇ", "the",
  "is", "a", "an", "and", "or", "to", "in", "of", "for", "it",
  "나", "너", "우리", "얘", "걔", "뭐", "왜", "어", "아", "응",
  "네", "예", "진짜", "근데", "그래", "했어", "했는데", "하는",
]);

export function trackKeywords(content: string): void {
  const words = content
    .replace(/<@!?\d+>/g, "")
    .replace(/[^\w가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  for (const word of words) {
    state.keywords[word] = (state.keywords[word] || 0) + 1;
  }
}

export function getTopKeywords(n: number = 20): { word: string; count: number }[] {
  return Object.entries(state.keywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

export function getUserStatsRanked(): (UserStat & { id: string })[] {
  return Object.entries(state.userStats)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.messages - a.messages);
}
