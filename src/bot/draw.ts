import { GoogleGenAI } from "@google/genai";
import { AttachmentBuilder } from "discord.js";

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });
  }
  return ai;
}

export type ImageModel = "flash" | "pro";

function imageModelName(quality: ImageModel): string {
  if (quality === "pro") return process.env.GOOGLE_IMAGE_MODEL_PRO || "gemini-2.5-flash-image-preview";
  return process.env.GOOGLE_IMAGE_MODEL_FLASH || "gemini-2.5-flash-image-preview";
}

const FALLBACK_ORDER: ImageModel[] = ["flash", "pro"];

export async function generateImage(
  prompt: string,
  quality: ImageModel = "flash"
): Promise<{ attachment: AttachmentBuilder; usedModel: ImageModel } | null> {
  const startIdx = FALLBACK_ORDER.indexOf(quality);
  const tryOrder = FALLBACK_ORDER.slice(startIdx);

  for (const q of tryOrder) {
    try {
      const result = await tryGenerate(prompt, q);
      if (result) return { attachment: result, usedModel: q };
    } catch (err) {
      const msg = (err as Error).message || "";
      const isRetryable = msg.includes("429") || msg.includes("quota") || msg.includes("limit") || msg.includes("503");
      if (!isRetryable || q === tryOrder[tryOrder.length - 1]) throw err;
      console.warn(`[Image Fallback] ${imageModelName(q)} 실패, ${imageModelName(tryOrder[tryOrder.indexOf(q) + 1])}로 재시도`);
    }
  }

  return null;
}

async function tryGenerate(prompt: string, quality: ImageModel): Promise<AttachmentBuilder | null> {
  const model = imageModelName(quality);

  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData && part.inlineData.mimeType?.startsWith("image/")) {
      const buffer = Buffer.from(part.inlineData.data!, "base64");
      return new AttachmentBuilder(buffer, { name: "toro-art.png" });
    }
  }

  return null;
}
