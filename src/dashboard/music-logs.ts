import fs from "fs";
import path from "path";

const DATA_DIR = path.join(__dirname, "../../data");
const MUSIC_LOGS_FILE = path.join(DATA_DIR, "music-logs.json");

export interface MusicLogEntry {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  duration: string;
  thumbnail: string;
  timestamp: number;
}

type LegacyMusicLogEntry = MusicLogEntry & { requestedBy?: unknown };

export function sanitizeMusicLogEntry(entry: LegacyMusicLogEntry): MusicLogEntry {
  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    url: entry.url,
    duration: entry.duration,
    thumbnail: entry.thumbnail,
    timestamp: entry.timestamp,
  };
}

let musicLogs: MusicLogEntry[] = [];

try {
  if (fs.existsSync(MUSIC_LOGS_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(MUSIC_LOGS_FILE, "utf-8")) as LegacyMusicLogEntry[];
    const containedRequesterIdentity = loaded.some(entry => Object.prototype.hasOwnProperty.call(entry, "requestedBy"));
    musicLogs = loaded.map(sanitizeMusicLogEntry);
    if (containedRequesterIdentity) saveLogs();
  }
} catch (err) {
  console.error("음악 로그 로드 실패:", (err as Error).message);
}

function saveLogs(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (musicLogs.length > 5000) musicLogs = musicLogs.slice(-5000);
    fs.writeFileSync(MUSIC_LOGS_FILE, JSON.stringify(musicLogs, null, 2));
  } catch (err) {
    console.error("음악 로그 저장 실패:", (err as Error).message);
  }
}

export function addMusicLog(entry: Omit<MusicLogEntry, "id" | "timestamp">): void {
  musicLogs.push({
    ...entry,
    id: `music_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  });
  saveLogs();
}

export function getMusicLogs(limit = 100): MusicLogEntry[] {
  return musicLogs.slice(-limit).reverse();
}

export function getMusicStats(): {
  totalPlays: number;
  topTracks: { title: string; artist: string | null; count: number }[];
} {
  const trackCounts = new Map<string, { title: string; artist: string | null; count: number }>();

  for (const log of musicLogs) {
    const existing = trackCounts.get(log.url);
    if (existing) existing.count++;
    else trackCounts.set(log.url, { title: log.title, artist: log.artist, count: 1 });
  }

  const topTracks = [...trackCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return { totalPlays: musicLogs.length, topTracks };
}
