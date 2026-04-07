import {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { addMusicLog } from "../../dashboard/music-logs";
import { parseArtist, normTitle, LEAVE_TIMEOUT } from "./utils";
import { searchTracks } from "./search";
import { autoplayNext } from "./autoplay";
import { createAudioStream } from "./stream";

// ── Activity callback (순환 의존성 해결) ──
let onActivityChange: ((title: string | null) => void) | null = null;

export function setActivityCallback(cb: (title: string | null) => void): void {
  onActivityChange = cb;
}

function setNowPlayingActivity(title: string): void {
  try { onActivityChange?.(title); } catch {}
}

function clearActivity(): void {
  try { onActivityChange?.(null); } catch {}
}

// ── Types ──
export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
}

export interface GuildQueue {
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
  volume: number; // 0.0 ~ 1.0
  currentResource: import("@discordjs/voice").AudioResource | null;
  history: Track[]; // 이전 곡 스택
  skipToHistory: boolean; // prev 호출 시 Idle에서 history push 방지
}

// ── State ──
export const queues = new Map<string, GuildQueue>();

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

export function prev(guildId: string): Track | null {
  const queue = queues.get(guildId);
  if (!queue || queue.history.length === 0) return null;
  const previous = queue.history.pop()!;
  // [current, next1, ...] → [previous, current, next1, ...]
  queue.tracks.unshift(previous);
  // Idle에서 shift하지 않도록 플래그 → tracks 그대로 유지 → playNext(previous)
  queue.skipToHistory = true;
  queue.player.stop(true);
  return previous;
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

  // 현재 곡 기준으로 히스토리 리셋 → 추천 방향 전환
  const current = queue.tracks[0];
  if (current) {
    queue.playedUrls.clear();
    queue.playedTitles.clear();
    queue.artistHistory.clear();
    queue.playedUrls.add(current.url);
    queue.playedTitles.add(normTitle(current.title));
    const artist = parseArtist(current.title);
    if (artist) queue.artistHistory.set(artist, 1);

    // 기존 autoplay 곡 제거 (유저 요청 곡은 유지)
    queue.tracks = [current, ...queue.tracks.slice(1).filter(t => !t.requestedBy.startsWith("Autoplay"))];
  }

  return true;
}

export function getAutoplay(guildId: string): { enabled: boolean; genre: string | null } {
  const queue = queues.get(guildId);
  return { enabled: queue?.autoplay || false, genre: queue?.autoplayGenre || null };
}

export function setVolume(guildId: string, vol: number): number {
  const queue = queues.get(guildId);
  if (!queue) return 50;
  queue.volume = Math.max(0, Math.min(1, vol));
  queue.currentResource?.volume?.setVolume(queue.volume);
  return Math.round(queue.volume * 100);
}

export function getVolume(guildId: string): number {
  return Math.round((queues.get(guildId)?.volume ?? 0.3) * 100);
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

export function isPaused(guildId: string): boolean {
  const queue = queues.get(guildId);
  return queue?.player.state.status === AudioPlayerStatus.Paused;
}

// ── Internal ──

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
      autoplay: true,
      autoplayGenre: null,
      playedUrls: new Set(),
      playedTitles: new Set(),
      artistHistory: new Map(),
      volume: 0.3,
      currentResource: null,
      history: [],
      skipToHistory: false,
    };
    queues.set(channel.guild.id, queue);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(channel.guild.id);
      if (!q) return;
      if (q.skipToHistory) {
        // prev() 호출 — shift 안 하고 바로 playNext (tracks 앞에 이전 곡이 있음)
        q.skipToHistory = false;
        if (q.tracks.length > 0) {
          playNext(channel.guild.id);
        }
        return;
      }
      const finished = q.tracks.shift();
      if (finished) {
        q.history.push(finished);
        if (q.history.length > 50) q.history.shift();
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

export async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue || queue.tracks.length === 0) return;

  const track = queue.tracks[0];

  try {
    const resource = createAudioStream(track.url, queue.volume);
    queue.currentResource = resource;
    queue.player.play(resource);
    queue.playing = true;
    setNowPlayingActivity(track.title);
    addMusicLog({
      title: track.title,
      artist: parseArtist(track.title),
      url: track.url,
      duration: track.duration,
      thumbnail: track.thumbnail,
      requestedBy: track.requestedBy,
    });

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

export function disconnect(guildId: string): void {
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
