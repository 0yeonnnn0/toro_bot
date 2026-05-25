import OpenAI from "openai";
import { AttachmentBuilder } from "discord.js";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  }
  return openai;
}

export type ImageModel = "flash" | "pro";

function imageModelName(): string {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
}

function imageQuality(quality: ImageModel): "low" | "high" {
  return quality === "pro" ? "high" : "low";
}

export async function generateImage(
  prompt: string,
  quality: ImageModel = "flash"
): Promise<{ attachment: AttachmentBuilder; usedModel: ImageModel } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for GPT image generation.");
  }

  const response = await getOpenAI().images.generate({
    model: imageModelName(),
    prompt,
    n: 1,
    size: "1024x1024",
    quality: imageQuality(quality),
    output_format: "png",
  });

  const image = response.data?.[0];
  if (!image?.b64_json) return null;

  const buffer = Buffer.from(image.b64_json, "base64");
  return { attachment: new AttachmentBuilder(buffer, { name: "toro-art.png" }), usedModel: quality };
}
