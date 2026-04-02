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
    };
    queues.set(channel.guild.id, queue);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(channel.guild.id);
      if (!q) return;
      q.tracks.shift();
      if (q.tracks.length > 0) {
        playNext(channel.guild.id);
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
