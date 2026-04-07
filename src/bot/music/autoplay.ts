import { spawn } from "child_process";
import type { Track, GuildQueue } from "./player";
import { queues, playNext, disconnect } from "./player";
import { normTitle, parseArtist, extractVideoId, parseDurationStr, formatDuration, MAX_DURATION_SEC, LEAVE_TIMEOUT } from "./utils";
import { ytdlpSearch } from "./search";

const AUTOPLAY_QUEUE_COUNT = 3;

export async function autoplayNext(guildId: string, lastTrack: Track): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue) return;

  try {
    const added: Track[] = [];

    // 1차: YouTube Radio Mix (RD 플레이리스트) — 유튜브 자체 추천
    try {
      const videoId = extractVideoId(lastTrack.url);
      if (videoId) {
        const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
        const mixData = await new Promise<string>((resolve, reject) => {
          const proc = spawn("yt-dlp", [
            "--flat-playlist", "--print", "%(title)s\t%(id)s\t%(duration_string)s",
            "--playlist-start", "2", "--playlist-end", "15",
            "--no-warnings", "--quiet",
            mixUrl,
          ]);
          let out = "";
          proc.stdout.on("data", (d) => out += d.toString());
          proc.stderr.on("data", () => {});
          proc.on("error", reject);
          proc.on("close", (code) => code === 0 ? resolve(out) : reject(new Error("yt-dlp mix failed")));
          setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 15000);
        });

        const lines = mixData.trim().split("\n").filter(l => l.includes("\t"));
        for (const line of lines) {
          if (added.length >= AUTOPLAY_QUEUE_COUNT) break;
          const [title, id, dur] = line.split("\t");
          if (!title || !id) continue;
          const url = `https://www.youtube.com/watch?v=${id}`;
          const sec = parseDurationStr(dur || "0");
          if (sec > MAX_DURATION_SEC) continue;
          if (queue.playedUrls.has(url)) continue;
          if (queue.playedTitles.has(normTitle(title))) continue;
          if (queue.tracks.some(t => t.url === url || normTitle(t.title) === normTitle(title))) continue;
          if (added.some(a => normTitle(a.title) === normTitle(title))) continue;

          added.push({
            title,
            url,
            duration: formatDuration(sec),
            thumbnail: "",
            requestedBy: "Autoplay",
          });
        }
        if (added.length > 0) console.log(`[Autoplay/YT Mix] ${added.map(t => t.title).join(", ")}`);
      }
    } catch (err) {
      console.error("[Autoplay/YT Mix] 실패:", (err as Error).message);
    }

    // 2차: 유튜브 검색 fallback (부족한 만큼 채움)
    if (added.length < AUTOPLAY_QUEUE_COUNT) {
      for (let attempt = 0; attempt < 3 && added.length < AUTOPLAY_QUEUE_COUNT; attempt++) {
        const searchQuery = buildAutoplayQuery(queue, lastTrack, attempt);
        const results = await ytdlpSearch(searchQuery, "Autoplay", 15);

        for (const r of results) {
          if (added.length >= AUTOPLAY_QUEUE_COUNT) break;
          if (queue.playedUrls.has(r.url)) continue;
          if (queue.playedTitles.has(normTitle(r.title))) continue;
          if (queue.tracks.some(t => t.url === r.url || normTitle(t.title) === normTitle(r.title))) continue;
          if (added.some(a => a.url === r.url || normTitle(a.title) === normTitle(r.title))) continue;

          added.push({
            title: r.title,
            url: r.url,
            duration: r.duration,
            thumbnail: r.thumbnail,
            requestedBy: "Autoplay",
          });
        }
      }
    }

    if (added.length === 0) {
      queue.playing = false;
      queue.leaveTimer = setTimeout(() => disconnect(guildId), LEAVE_TIMEOUT);
      return;
    }

    for (const track of added) {
      queue.tracks.push(track);
    }
    console.log(`[Autoplay] 총 ${added.length}곡 추가`);

    if (!queue.playing) {
      await playNext(guildId);
    }
  } catch (err) {
    console.error("Autoplay 실패:", (err as Error).message);
    queue.playing = false;
    queue.leaveTimer = setTimeout(() => disconnect(guildId), LEAVE_TIMEOUT);
  }
}

function buildAutoplayQuery(queue: GuildQueue, lastTrack: Track, attempt: number): string {
  // 장르가 지정되어 있으면 장르 기반 검색
  if (queue.autoplayGenre) {
    const lastArtist = parseArtist(lastTrack.title);
    if (attempt === 0 && lastArtist) return `${lastArtist} ${queue.autoplayGenre}`;
    if (attempt === 0) return `${queue.autoplayGenre} music playlist`;
    if (attempt === 1) return `${queue.autoplayGenre} popular songs`;
    return `best ${queue.autoplayGenre} music`;
  }

  // 아티스트 히스토리가 있으면 가중치 랜덤으로 선택
  if (queue.artistHistory.size > 0 && attempt < 2) {
    const artists = [...queue.artistHistory.entries()];
    const totalWeight = artists.reduce((sum, [, count]) => sum + count, 0);
    let rand = Math.random() * totalWeight;

    for (const [artist, count] of artists) {
      rand -= count;
      if (rand <= 0) {
        return `${artist} music`;
      }
    }
  }

  const lastArtist = parseArtist(lastTrack.title);
  if (lastArtist) return `${lastArtist} music`;
  return `${lastTrack.title} music`;
}
