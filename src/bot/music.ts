import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import play from "play-dl";
import { spawn } from "child_process";
import { ActivityType, type VoiceBasedChannel } from "discord.js";
import { client } from "./client";

// ── Types ──
export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
}

interface GuildQueue {
  tracks: Track[];
  player: AudioPlayer;
  connection: VoiceConnection;
  playing: boolean;
  leaveTimer: ReturnType<typeof setTimeout> | null;
  autoplay: boolean;
  autoplayGenre: string | null;
  playedUrls: Set<string>;
  playedTitles: Set<string>;
  artistHistory: Map<string, number>;
}

// ── State ──
const queues = new Map<string, GuildQueue>();
const LEAVE_TIMEOUT = 5 * 60 * 1000; // 5분

// ── Public API ──

export async function playTrack(
  channel: VoiceBasedChannel,
  query: string,
  requestedBy: string,
): Promise<{ track: Track; position: number }> {
  const tracks = await searchTracks(query, requestedBy, 1);
  if (tracks.length === 0) throw new Error("노래를 찾을 수 없어");
  const track = tracks[0];
  const position = await playTrackDirect(channel, track);
  return { track, position };
}

export function skip(guildId: string): Track | null {
  const queue = queues.get(guildId);
  if (!queue || !queue.playing || queue.tracks.length === 0) return null;
  const skipped = queue.tracks[0];
  queue.player.stop(true); // Idle 이벤트가 shift + 다음 곡 재생 트리거
  return skipped;
}

export function stop(guildId: string): void {
  disconnect(guildId);
}

export function pause(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;

  if (queue.player.state.status === AudioPlayerStatus.Paused) {
    queue.player.unpause();
    return false; // resumed
  } else {
    queue.player.pause();
    return true; // paused
  }
}

export function getQueue(guildId: string): Track[] {
  return queues.get(guildId)?.tracks || [];
}

export function getNowPlaying(guildId: string): Track | null {
  const queue = queues.get(guildId);
  if (!queue || !queue.playing || queue.tracks.length === 0) return null;
  return queue.tracks[0];
}

export function removeTrack(guildId: string, index: number): Track | null {
  const queue = queues.get(guildId);
  if (!queue || index < 1 || index >= queue.tracks.length) return null;
  return queue.tracks.splice(index, 1)[0];
}

export function setAutoplay(guildId: string, genre: string | null): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  if (genre === "off") {
    queue.autoplay = false;
    queue.autoplayGenre = null;
    return false;
  }
  queue.autoplay = true;
  queue.autoplayGenre = genre;
  return true;
}

export function getAutoplay(guildId: string): { enabled: boolean; genre: string | null } {
  const queue = queues.get(guildId);
  return { enabled: queue?.autoplay || false, genre: queue?.autoplayGenre || null };
}

export async function triggerAutoplayNow(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue || !queue.autoplay || queue.tracks.length === 0) return;
  const current = queue.tracks[0];
  await autoplayNext(guildId, current);
}

export function isPlaying(guildId: string): boolean {
  return queues.get(guildId)?.playing || false;
}

// ── Internal ──

const MAX_DURATION_SEC = 15 * 60; // 15분

function cleanYoutubeUrl(url: string): string {
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

export async function searchTracks(query: string, requestedBy: string, limit: number = 5): Promise<Track[]> {
  try {
    const cleaned = cleanYoutubeUrl(query);
    if (play.yt_validate(cleaned) === "video") {
      const details = await play.video_basic_info(cleaned);
      const info = details.video_details;
      const sec = info.durationInSec || 0;
      if (sec > MAX_DURATION_SEC) return [];
      return [{
        title: info.title || "Unknown",
        url: info.url,
        duration: formatDuration(sec),
        thumbnail: info.thumbnails?.[0]?.url || "",
        requestedBy,
      }];
    }

    // yt-dlp로 유튜브 검색
    const searchResults = await new Promise<string>((resolve, reject) => {
      const proc = spawn("yt-dlp", [
        `ytsearch${limit}:${query}`,
        "--get-title", "--get-id", "--get-duration",
        "--no-warnings", "--quiet",
      ]);
      let out = "";
      proc.stdout.on("data", (d) => out += d.toString());
      proc.stderr.on("data", () => {});
      proc.on("error", reject);
      proc.on("close", (code) => code === 0 ? resolve(out) : reject(new Error("yt search failed")));
      setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 30000);
    });

    const lines = searchResults.trim().split("\n");
    const tracks: Track[] = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const title = lines[i];
      const id = lines[i + 1];
      const sec = parseDurationStr(lines[i + 2] || "0");
      if (!title || !id) continue;
      if (sec > MAX_DURATION_SEC) continue;
      tracks.push({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: formatDuration(sec),
        thumbnail: "",
        requestedBy,
      });
    }
    return tracks.slice(0, limit);
  } catch (err) {
    console.error("유튜브 검색 실패:", (err as Error).message);
    return [];
  }
}

export async function playTrackDirect(
  channel: VoiceBasedChannel,
  track: Track,
): Promise<number> {
  let queue = queues.get(channel.guild.id);

  if (!queue) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    queue = {
      tracks: [],
      player,
      connection,
      playing: false,
      leaveTimer: null,
      autoplay: false,
      autoplayGenre: null,
      playedUrls: new Set(),
      playedTitles: new Set(),
      artistHistory: new Map(),
    };
    queues.set(channel.guild.id, queue);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(channel.guild.id);
      if (!q) return;
      const finished = q.tracks.shift();
      if (finished) {
        q.playedUrls.add(finished.url);
        q.playedTitles.add(normTitle(finished.title));
        const artist = parseArtist(finished.title);
        if (artist) q.artistHistory.set(artist, (q.artistHistory.get(artist) || 0) + 1);
      }
      if (q.tracks.length > 0) {
        playNext(channel.guild.id);
        // 대기열 1곡 이하면 미리 채워놓기
        if (q.autoplay && q.tracks.length <= 1 && finished) {
          autoplayNext(channel.guild.id, finished).catch(() => {});
        }
      } else if (q.autoplay && finished) {
        q.playing = false;
        autoplayNext(channel.guild.id, finished).catch(() => {
          q.leaveTimer = setTimeout(() => disconnect(channel.guild.id), LEAVE_TIMEOUT);
        });
      } else {
        q.playing = false;
        q.leaveTimer = setTimeout(() => disconnect(channel.guild.id), LEAVE_TIMEOUT);
      }
    });

    player.on("error", (err) => {
      console.error("음악 재생 에러:", err.message);
      // 에러 시 다음 곡으로 — Idle 이벤트가 처리하도록 player.stop()만
      const q = queues.get(channel.guild.id);
      if (q && q.tracks.length > 0) {
        q.player.stop();
      }
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await entersState(connection, VoiceConnectionStatus.Connecting, 5000);
      } catch {
        disconnect(channel.guild.id);
      }
    });
  }

  if (queue.leaveTimer) {
    clearTimeout(queue.leaveTimer);
    queue.leaveTimer = null;
  }

  // 유저 곡은 autoplay 곡들 앞에 삽입
  const firstAutoplayIdx = queue.tracks.findIndex((t, i) => i > 0 && t.requestedBy.startsWith("Autoplay"));
  if (firstAutoplayIdx > 0) {
    queue.tracks.splice(firstAutoplayIdx, 0, track);
  } else {
    queue.tracks.push(track);
  }
  const position = queue.tracks.indexOf(track) + 1;

  if (!queue.playing) {
    await playNext(channel.guild.id);
  }

  return position;
}

async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue || queue.tracks.length === 0) return;

  const track = queue.tracks[0];

  try {
    // yt-dlp로 오디오 스트림 추출 → FFmpeg로 opus 변환
    const ytdlp = spawn("yt-dlp", [
      "-f", "bestaudio",
      "-o", "-",
      "--no-warnings",
      "--quiet",
      track.url,
    ]);

    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-analyzeduration", "0",
      "-loglevel", "0",
      "-f", "opus",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1",
    ]);

    ytdlp.stdout.pipe(ffmpeg.stdin);

    // EPIPE 에러 방지 — 한쪽이 먼저 닫혀도 크래시 안 나도록
    ytdlp.stdin?.on("error", () => {});
    ytdlp.stdout.on("error", () => {});
    ffmpeg.stdin.on("error", () => {});
    ffmpeg.stdout.on("error", () => {});
    ytdlp.on("error", () => {});
    ffmpeg.on("error", () => {});

    ytdlp.stderr.on("data", (d) => console.error("yt-dlp:", d.toString().trim()));
    ffmpeg.stderr.on("data", (d) => console.error("ffmpeg:", d.toString().trim()));

    const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.OggOpus });
    queue.player.play(resource);
    queue.playing = true;
    setNowPlayingActivity(track.title);
  } catch (err) {
    console.error("스트림 생성 실패:", (err as Error).message);
    queue.tracks.shift();
    if (queue.tracks.length > 0) {
      playNext(guildId);
    } else {
      queue.playing = false;
    }
  }
}

function disconnect(guildId: string): void {
  const queue = queues.get(guildId);
  if (queue) {
    if (queue.leaveTimer) clearTimeout(queue.leaveTimer);
    queue.player.stop();
    queue.connection.destroy();
    queues.delete(guildId);
  } else {
    const conn = getVoiceConnection(guildId);
    conn?.destroy();
  }
  clearActivity();
}

function setNowPlayingActivity(title: string): void {
  try {
    client.user?.setActivity(title, { type: ActivityType.Listening });
  } catch {}
}

function clearActivity(): void {
  try {
    client.user?.setActivity(undefined as any);
  } catch {}
}

const AUTOPLAY_QUEUE_COUNT = 3;

async function autoplayNext(guildId: string, lastTrack: Track): Promise<void> {
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
        let results: any[] = [];
        try {
          results = await play.search(searchQuery, { limit: 15, source: { youtube: "video" } });
        } catch {
          // play-dl 실패 → yt-dlp 검색
          try {
            const ytdlpSearch = await new Promise<string>((resolve, reject) => {
              const proc = spawn("yt-dlp", [
                `ytsearch10:${searchQuery}`,
                "--get-title", "--get-id", "--get-duration",
                "--no-warnings", "--quiet",
              ]);
              let out = "";
              proc.stdout.on("data", (d) => out += d.toString());
              proc.on("close", (code) => code === 0 ? resolve(out) : reject(new Error("search failed")));
              proc.on("error", reject);
              setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 10000);
            });
            const searchLines = ytdlpSearch.trim().split("\n");
            for (let i = 0; i + 2 < searchLines.length; i += 3) {
              results.push({
                title: searchLines[i],
                url: `https://www.youtube.com/watch?v=${searchLines[i + 1]}`,
                durationInSec: parseDurationStr(searchLines[i + 2]),
              });
            }
          } catch {}
        }

        for (const r of results) {
          if (added.length >= AUTOPLAY_QUEUE_COUNT) break;
          const sec = r.durationInSec || 0;
          const title = r.title || "Unknown";
          if (sec > MAX_DURATION_SEC) continue;
          if (queue.playedUrls.has(r.url)) continue;
          if (queue.playedTitles.has(normTitle(title))) continue;
          if (queue.tracks.some(t => t.url === r.url || normTitle(t.title) === normTitle(title))) continue;
          if (added.some(a => a.url === r.url || normTitle(a.title) === normTitle(title))) continue;

          added.push({
            title,
            url: r.url,
            duration: formatDuration(sec),
            thumbnail: r.thumbnails?.[0]?.url || "",
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

function normTitle(title: string): string {
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

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
  } catch {}
  return null;
}

function parseDurationStr(str: string): number {
  // "3:27" or "1:03:27" → seconds
  const parts = str.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
