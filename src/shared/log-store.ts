import fs from "fs";
import path from "path";
import type { LogEntry } from "./state";

const LOGS_DIR = path.join(__dirname, "../../data/logs");

function ensureDir(): void {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function dateStr(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  return d.toISOString().slice(0, 10); // "2026-03-30"
}

function logFilePath(date: string): string {
  return path.join(LOGS_DIR, `${date}.json`);
}

// ── Append ──
export function appendLog(entry: LogEntry): void {
  ensureDir();
  const date = dateStr(entry.timestamp);
  const fp = logFilePath(date);

  let logs: LogEntry[] = [];
  try {
    if (fs.existsSync(fp)) {
      logs = JSON.parse(fs.readFileSync(fp, "utf-8"));
    }
  } catch {}

  logs.push(entry);
  fs.writeFileSync(fp, JSON.stringify(logs));
}

// ── Read ──
export function readLogs(date: string): LogEntry[] {
  const fp = logFilePath(date);
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, "utf-8"));
    }
  } catch {}
  return [];
}

// ── List available dates ──
export function listLogDates(): string[] {
  ensureDir();
  try {
    return fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(".json", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// ── Today's count ──
export function todayLogCount(): number {
  return readLogs(dateStr()).length;
}

// ── Migrate: move existing in-memory logs to files ──
export function migrateLogs(logs: LogEntry[]): void {
  if (logs.length === 0) return;
  ensureDir();

  const byDate = new Map<string, LogEntry[]>();
  for (const log of logs) {
    const date = dateStr(log.timestamp);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(log);
  }

  for (const [date, entries] of byDate) {
    const fp = logFilePath(date);
    let existing: LogEntry[] = [];
    try {
      if (fs.existsSync(fp)) existing = JSON.parse(fs.readFileSync(fp, "utf-8"));
    } catch {}

    // Dedupe by timestamp
    const existingTs = new Set(existing.map(e => e.timestamp));
    const newEntries = entries.filter(e => !existingTs.has(e.timestamp));
    if (newEntries.length > 0) {
      existing.push(...newEntries);
      existing.sort((a, b) => a.timestamp - b.timestamp);
      fs.writeFileSync(fp, JSON.stringify(existing));
    }
  }

  console.log(`로그 마이그레이션 완료: ${logs.length}개 → 파일`);
}
