import OpenAI from "openai";
import { AttachmentBuilder } from "discord.js";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  }
  return openai;
}

export const VOICES = {
  kore: "nova",
  aoede: "shimmer",
  puck: "echo",
  charon: "onyx",
  fenrir: "fable",
  leda: "sage",
} as const;

export type VoiceName = keyof typeof VOICES;

function ttsModel(): string {
  return process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
}

export async function generateSpeech(
  text: string,
  voice: VoiceName = "kore"
): Promise<AttachmentBuilder | null> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for GPT text-to-speech.");
  }

  const speech = await getOpenAI().audio.speech.create({
    model: ttsModel(),
    voice: VOICES[voice] || VOICES.kore,
    input: text,
    response_format: "mp3",
    instructions: "Natural Korean Discord bot voice. Keep the text exactly as written; do not add or remove words.",
  });

  const audio = Buffer.from(await speech.arrayBuffer());
  if (audio.length === 0) return null;
  return new AttachmentBuilder(audio, { name: "toro-voice.mp3" });
}
