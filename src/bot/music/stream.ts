import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice";
import { spawn } from "child_process";
import { PassThrough } from "stream";

/**
 * yt-dlp + FFmpeg 파이프라인으로 오디오 스트림 생성
 * URL → yt-dlp(bestaudio) → FFmpeg(PCM s16le) → PassThrough → AudioResource
 */
export function createAudioStream(url: string, volume: number): AudioResource {
  const ytdlp = spawn("yt-dlp", [
    "-f", "bestaudio[acodec=opus]/bestaudio",
    "-o", "-",
    "--no-warnings",
    "--quiet",
    "--no-part",
    "--buffer-size", "1M",
    "--retries", "3",
    "--fragment-retries", "3",
    url,
  ]);

  const ffmpeg = spawn("ffmpeg", [
    "-thread_queue_size", "8192",
    "-i", "pipe:0",
    "-analyzeduration", "0",
    "-probesize", "500000",
    "-loglevel", "0",
    "-f", "s16le",
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

  // 프리버퍼 제거 — PassThrough 1MB highWaterMark + discord.js 50패킷 버퍼로 안정화
  const output = new PassThrough({ highWaterMark: 1024 * 1024 });
  ffmpeg.stdout.pipe(output);

  const resource = createAudioResource(output, {
    inputType: StreamType.Raw,
    inlineVolume: true,
    silencePaddingFrames: 5,
  });
  resource.volume?.setVolume(volume);
  return resource;
}
