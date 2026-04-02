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
import type { VoiceBasedChannel } from "discord.js";

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
  playedUrls: Set<string>;
  artistHistory: Map<string, number>; // artist → play count
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
  if (!queue || !queue.playing) return null;
  const skipped = queue.tracks[0] || null;
  queue.player.stop(); // Idle 이벤트가 다음 곡 재생 트리거
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

export function toggleAutoplay(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  queue.autoplay = !queue.autoplay;
  return queue.autoplay;
}

export function getAutoplay(guildId: string): boolean {
  return queues.get(guildId)?.autoplay || false;
}

export function isPlaying(guildId: string): boolean {
  return queues.get(guildId)?.playing || false;
}

// ── Internal ──

const MAX_DURATION_SEC = 20 * 60; // 20분

export async function searchTracks(query: string, requestedBy: string, limit: number = 5): Promise<Track[]> {
  try {
    if (play.yt_validate(query) === "video") {
      const details = await play.video_basic_info(query);
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

    const results = await play.search(query + " music", { limit: limit + 5, source: { youtube: "video" } });
    return results
      .filter(info => (info.durationInSec || 0) <= MAX_DURATION_SEC)
      .slice(0, limit)
      .map(info => ({
        title: info.title || "Unknown",
        url: info.url,
        duration: formatDuration(info.durationInSec || 0),
        thumbnail: info.thumbnails?.[0]?.url || "",
        requestedBy,
      }));
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
      playedUrls: new Set(),
      artistHistory: new Map(),
    };
    queues.set(channel.guild.id, queue);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(channel.guild.id);
      if (!q) return;
      const finished = q.tracks.shift();
      if (finished) {
        q.playedUrls.add(finished.url);
        const artist = parseArtist(finished.title);
        if (artist) q.artistHistory.set(artist, (q.artistHistory.get(artist) || 0) + 1);
      }
      if (q.tracks.length > 0) {
        playNext(channel.guild.id);
      } else if (q.autoplay && finished) {
        // 자동 추천
        autoplayNext(channel.guild.id, finished).catch(() => {});
      } else {
        q.playing = false;
        q.leaveTimer = setTimeout(() => disconnect(channel.guild.id), LEAVE_TIMEOUT);
      }
    });

    player.on("error", (err) => {
      console.error("음악 재생 에러:", err.message);
      const q = queues.get(channel.guild.id);
      if (q && q.tracks.length > 1) {
        q.tracks.shift();
        playNext(channel.guild.id);
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

  queue.tracks.push(track);
  const position = queue.tracks.length;

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
    ytdlp.stderr.on("data", (d) => console.error("yt-dlp:", d.toString().trim()));
    ffmpeg.stderr.on("data", (d) => console.error("ffmpeg:", d.toString().trim()));

    const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.OggOpus });
    queue.player.play(resource);
    queue.playing = true;
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
}

async function autoplayNext(guildId: string, lastTrack: Track): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue) return;

  try {
    // 아티스트 기반 추천: 가중치 랜덤으로 아티스트 선택
    const searchQuery = buildAutoplayQuery(queue, lastTrack);
    const results = await play.search(searchQuery, { limit: 10, source: { youtube: "video" } });
    const next = results.find(r =>
      (r.durationInSec || 0) <= MAX_DURATION_SEC && !queue.playedUrls.has(r.url)
    );

    if (!next) {
      // fallback: 마지막 곡 제목으로 검색
      const fallbackResults = await play.search(lastTrack.title + " music", { limit: 10, source: { youtube: "video" } });
      const fallbackNext = fallbackResults.find(r =>
        (r.durationInSec || 0) <= MAX_DURATION_SEC && !queue.playedUrls.has(r.url)
      );

      if (!fallbackNext) {
        queue.playing = false;
        queue.leaveTimer = setTimeout(() => disconnect(guildId), LEAVE_TIMEOUT);
        return;
      }

      const track: Track = {
        title: fallbackNext.title || "Unknown",
        url: fallbackNext.url,
        duration: formatDuration(fallbackNext.durationInSec || 0),
        thumbnail: fallbackNext.thumbnails?.[0]?.url || "",
        requestedBy: "Autoplay",
      };
      queue.tracks.push(track);
      await playNext(guildId);
      console.log(`[Autoplay/fallback] ${track.title}`);
      return;
    }

    const track: Track = {
      title: next.title || "Unknown",
      url: next.url,
      duration: formatDuration(next.durationInSec || 0),
      thumbnail: next.thumbnails?.[0]?.url || "",
      requestedBy: "Autoplay",
    };

    queue.tracks.push(track);
    await playNext(guildId);
    console.log(`[Autoplay] ${track.title} (query: ${searchQuery})`);
  } catch (err) {
    console.error("Autoplay 실패:", (err as Error).message);
    queue.playing = false;
    queue.leaveTimer = setTimeout(() => disconnect(guildId), LEAVE_TIMEOUT);
  }
}

function buildAutoplayQuery(queue: GuildQueue, lastTrack: Track): string {
  const lastArtist = parseArtist(lastTrack.title);

  // 아티스트 히스토리가 있으면 가중치 랜덤으로 선택
  if (queue.artistHistory.size > 0) {
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

  // 아티스트 파싱 가능하면 그 아티스트로
  if (lastArtist) return `${lastArtist} music`;

  // fallback
  return `${lastTrack.title} music`;
}

function parseArtist(title: string): string | null {
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
