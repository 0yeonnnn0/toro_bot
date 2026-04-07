export const MAX_DURATION_SEC = 15 * 60; // 15분
export const LEAVE_TIMEOUT = 5 * 60 * 1000; // 5분

export function cleanYoutubeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.has("v")) {
      return `https://www.youtube.com/watch?v=${u.searchParams.get("v")}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`;
    }
  } catch {}
  return url;
}

export function parseArtist(title: string): string | null {
  // "Artist - Title", "Artist — Title", "Artist | Title" 패턴
  const separators = [" - ", " — ", " – ", " | "];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      const artist = title.slice(0, idx).trim();
      // 너무 짧거나 긴 건 아티스트가 아닐 수 있음
      if (artist.length >= 2 && artist.length <= 50) return artist;
    }
  }
  return null;
}

export function normTitle(title: string): string {
  // "Artist - Title" → Title 부분만 추출
  let songPart = title;
  const separators = [" - ", " — ", " – ", " | "];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      songPart = title.slice(idx + sep.length);
      break;
    }
  }
  // 괄호 제거, 소문자, 특수문자 제거
  return songPart.toLowerCase().replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, "").replace(/[^a-z0-9가-힣]/g, "").trim();
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
  } catch {}
  return null;
}

export function parseDurationStr(str: string): number {
  // "3:27" or "1:03:27" → seconds
  const parts = str.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
