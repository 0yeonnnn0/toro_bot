import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice";
import { spawn } from "child_process";
import { PassThrough } from "stream";

/**
 * yt-dlp + FFmpeg 파이프라인으로 오디오 스트림 생성
 * URL → yt-dlp(bestaudio) → FFmpeg(PCM s16le) → 프리버퍼 → AudioResource
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

  // 프리버퍼: 192KB (약 1초 분량의 PCM) 쌓인 후 재생 시작
  const PRE_BUFFER_SIZE = 192 * 1024;
  const preBuffer: Buffer[] = [];
  let preBufferBytes = 0;
  let flushed = false;
  const output = new PassThrough({ highWaterMark: 512 * 1024 });

  ffmpeg.stdout.on("data", (chunk: Buffer) => {
    if (flushed) {
      output.write(chunk);
      return;
    }
    preBuffer.push(chunk);
    preBufferBytes += chunk.length;
    if (preBufferBytes >= PRE_BUFFER_SIZE) {
      flushed = true;
      for (const buf of preBuffer) output.write(buf);
      preBuffer.length = 0;
    }
  });
  ffmpeg.stdout.on("end", () => {
    // 프리버퍼 못 채운 짧은 곡 — 있는 만큼 flush
    if (!flushed) {
      for (const buf of preBuffer) output.write(buf);
      preBuffer.length = 0;
    }
    output.end();
  });
  ffmpeg.stdout.on("error", (err) => output.destroy(err));

  const resource = createAudioResource(output, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume?.setVolume(volume);
  return resource;
}
