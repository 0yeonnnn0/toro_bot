import { spawn } from "child_process";
import type { Track } from "./player";
import { cleanYoutubeUrl, formatDuration, MAX_DURATION_SEC } from "./utils";

export function ytdlpGetInfo(url: string): Promise<{ title: string; url: string; duration: number; thumbnail: string } | null> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", [
      "--print", "%(title)s\t%(id)s\t%(duration)s\t%(thumbnail)s",
      "--no-warnings", "--quiet", "--no-playlist",
      url,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => out += d.toString());
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const [title, id, dur, thumb] = out.trim().split("\t");
      if (!title || !id) return resolve(null);
      resolve({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: parseInt(dur) || 0,
        thumbnail: thumb || "",
      });
    });
    setTimeout(() => { proc.kill(); resolve(null); }, 10000);
  });
}

export function ytdlpSearch(query: string, requestedBy: string, limit: number): Promise<Track[]> {
  return new Promise((resolve) => {
    const fetchCount = Math.min(limit + 5, 20);
    const proc = spawn("yt-dlp", [
      `ytsearch${fetchCount}:${query}`,
      "--flat-playlist",
      "--print", "%(title)s\t%(id)s\t%(duration)s\t%(thumbnail)s",
      "--no-warnings", "--quiet",
    ]);
    let out = "";
    proc.stdout.on("data", (d) => out += d.toString());
    proc.on("error", () => resolve([]));
    proc.on("close", () => {
      const tracks: Track[] = [];
      for (const line of out.trim().split("\n")) {
        if (tracks.length >= limit) break;
        const [title, id, dur, thumb] = line.split("\t");
        if (!title || !id) continue;
        const sec = parseInt(dur) || 0;
        if (sec > MAX_DURATION_SEC) continue;
        tracks.push({
          title,
          url: `https://www.youtube.com/watch?v=${id}`,
          duration: formatDuration(sec),
          thumbnail: thumb || "",
          requestedBy,
        });
      }
      resolve(tracks);
    });
    setTimeout(() => { proc.kill(); resolve([]); }, 30000);
  });
}

export async function searchTracks(query: string, requestedBy: string, limit: number = 5): Promise<Track[]> {
  try {
    const cleaned = cleanYoutubeUrl(query);
    const isUrl = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/.test(cleaned);

    if (isUrl) {
      // URL → yt-dlp로 영상 정보 추출
      const info = await ytdlpGetInfo(cleaned);
      if (!info || info.duration > MAX_DURATION_SEC) return [];
      return [{
        title: info.title,
        url: info.url,
        duration: formatDuration(info.duration),
        thumbnail: info.thumbnail,
        requestedBy,
      }];
    }

    // 텍스트 검색 → yt-dlp
    return await ytdlpSearch(query, requestedBy, limit);
  } catch (err) {
    console.error("유튜브 검색 실패:", (err as Error).message);
    return [];
  }
}
