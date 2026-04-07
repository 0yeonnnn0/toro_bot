import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice";
import { spawn, execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const TEMP_DIR = path.join(os.tmpdir(), "toro-audio");

// 시작 시 임시 디렉토리 생성 + 기존 파일 정리
try {
  if (fs.existsSync(TEMP_DIR)) {
    for (const f of fs.readdirSync(TEMP_DIR)) fs.unlinkSync(path.join(TEMP_DIR, f));
  } else {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
} catch {}

/**
 * yt-dlp로 오디오를 임시 파일로 다운로드
 * 다운로드 완료 후 파일 경로 반환
 */
export function downloadAudio(url: string): Promise<string> {
  const filePath = path.join(TEMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}.webm`);

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "-f", "bestaudio[acodec=opus]/bestaudio",
      "-o", filePath,
      "--no-warnings",
      "--quiet",
      "--no-part",
      "--retries", "5",
      "--fragment-retries", "5",
      "--throttled-rate", "100K",
      url,
    ]);

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(filePath)) {
        resolve(filePath);
      } else {
        reject(new Error(`yt-dlp 다운로드 실패 (code: ${code})`));
      }
    });
    setTimeout(() => { proc.kill(); reject(new Error("다운로드 타임아웃")); }, 30000);
  });
}

/**
 * 다운로드된 파일에서 AudioResource 생성
 * 파일 → FFmpeg(PCM) → discord.js AudioResource
 */
export function createAudioStreamFromFile(filePath: string, volume: number): AudioResource {
  const ffmpeg = spawn("ffmpeg", [
    "-i", filePath,
    "-analyzeduration", "0",
    "-loglevel", "0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ]);

  ffmpeg.stdin?.on("error", () => {});
  ffmpeg.stdout.on("error", () => {});
  ffmpeg.on("error", () => {});
  ffmpeg.stderr.on("data", (d) => console.error("ffmpeg:", d.toString().trim()));

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true,
    silencePaddingFrames: 5,
  });
  resource.volume?.setVolume(volume);
  return resource;
}

/**
 * 임시 파일 삭제
 */
export function cleanupFile(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch {}
}
