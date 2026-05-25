import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import OpenAI from "openai";
import { AttachmentBuilder } from "discord.js";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  }
  return openai;
}

const EDGE_VOICES = {
  kore: "ko-KR-SunHiNeural",
  aoede: "ko-KR-SunHiNeural",
  puck: "ko-KR-InJoonNeural",
  charon: "ko-KR-InJoonNeural",
  fenrir: "ko-KR-InJoonNeural",
  leda: "ko-KR-SunHiNeural",
} as const;

const OPENAI_VOICES = {
  kore: "nova",
  aoede: "shimmer",
  puck: "echo",
  charon: "onyx",
  fenrir: "fable",
  leda: "sage",
} as const;

export const VOICES = EDGE_VOICES;
export type VoiceName = keyof typeof EDGE_VOICES;

function ttsProvider(): "edge" | "openai" {
  return process.env.TORO_TTS_PROVIDER === "openai" ? "openai" : "edge";
}

function ttsModel(): string {
  return process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
}

function edgeTtsPython(): string {
  return process.env.EDGE_TTS_PYTHON || "python3";
}

function edgeTtsTimeoutMs(): number {
  return Number(process.env.EDGE_TTS_TIMEOUT_MS || 60000);
}

function runEdgeTts(text: string, voiceName: string, outputFile: string): Promise<void> {
  const args = [
    "-m",
    "edge_tts",
    "--voice",
    voiceName,
    "--write-media",
    outputFile,
    "--text",
    text,
  ];
  const rate = process.env.EDGE_TTS_RATE;
  const pitch = process.env.EDGE_TTS_PITCH;
  const volume = process.env.EDGE_TTS_VOLUME;
  if (rate) args.push("--rate", rate);
  if (pitch) args.push("--pitch", pitch);
  if (volume) args.push("--volume", volume);

  return new Promise((resolve, reject) => {
    const child = spawn(edgeTtsPython(), args, { env: process.env });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Edge TTS timed out after ${edgeTtsTimeoutMs()}ms`));
    }, edgeTtsTimeoutMs());

    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputFile)) resolve();
      else reject(new Error(`Edge TTS failed (${code}): ${stderr.slice(-1000)}`));
    });
  });
}

async function generateEdgeSpeech(text: string, voice: VoiceName): Promise<AttachmentBuilder | null> {
  const voiceName = process.env.EDGE_TTS_VOICE || EDGE_VOICES[voice] || EDGE_VOICES.kore;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-edge-tts-"));
  const outputFile = path.join(tmpDir, "toro-voice.mp3");
  try {
    await runEdgeTts(text, voiceName, outputFile);
    const audio = fs.readFileSync(outputFile);
    if (audio.length === 0) return null;
    return new AttachmentBuilder(audio, { name: "toro-voice.mp3" });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function generateOpenAISpeech(text: string, voice: VoiceName): Promise<AttachmentBuilder | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const speech = await getOpenAI().audio.speech.create({
    model: ttsModel(),
    voice: OPENAI_VOICES[voice] || OPENAI_VOICES.kore,
    input: text,
    response_format: "mp3",
    instructions: "Natural Korean Discord bot voice. Keep the text exactly as written; do not add or remove words.",
  });

  const audio = Buffer.from(await speech.arrayBuffer());
  if (audio.length === 0) return null;
  return new AttachmentBuilder(audio, { name: "toro-voice.mp3" });
}

export async function generateSpeech(
  text: string,
  voice: VoiceName = "kore"
): Promise<AttachmentBuilder | null> {
  if (ttsProvider() === "openai") {
    const openaiSpeech = await generateOpenAISpeech(text, voice);
    if (openaiSpeech) return openaiSpeech;
  }

  try {
    const edgeSpeech = await generateEdgeSpeech(text, voice);
    if (edgeSpeech) return edgeSpeech;
  } catch (err) {
    const msg = (err as Error).message || "";
    console.warn(`[TTS] Edge TTS failed, OpenAI fallback if configured: ${msg.slice(0, 160)}`);
    const openaiSpeech = await generateOpenAISpeech(text, voice);
    if (openaiSpeech) return openaiSpeech;
    throw err;
  }

  return await generateOpenAISpeech(text, voice);
}
