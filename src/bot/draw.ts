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

export type ImageModel = "flash" | "pro";
export type ImageProvider = "codex" | "openai" | "local";

function imageModelName(): string {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
}

function imageQuality(quality: ImageModel): "low" | "high" {
  return quality === "pro" ? "high" : "low";
}

function codexTimeoutMs(): number {
  return Number(process.env.CODEX_IMAGE_TIMEOUT_MS || process.env.CODEX_TIMEOUT_MS || 180000);
}

function runCodexForImage(prompt: string, quality: ImageModel, workdir: string, outputFile: string): Promise<void> {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--cd",
    workdir,
    "-",
  ];

  const codexPrompt = [
    "You are TORO's image generation worker.",
    "Create an original image for this Discord /draw request using the best image-generation capability available to your Codex/ChatGPT session.",
    "Do not ask follow-up questions. Do not require an OpenAI API key. Do not call Gemini.",
    `Save the final image as a PNG file at exactly: ${outputFile}`,
    "The file must be a valid PNG image attachment, not Markdown and not a text description.",
    `Quality preset: ${quality === "pro" ? "high detail" : "fast draft"}`,
    "If you need to run local commands to write the file, you may do so inside the working directory.",
    "",
    "Prompt:",
    prompt,
  ].join("\n");

  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CODEX_BIN || "codex", args, {
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex image generation timed out after ${codexTimeoutMs()}ms`));
    }, codexTimeoutMs());

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputFile)) resolve();
      else reject(new Error(`Codex image generation failed (${code}): ${(stderr || stdout).slice(-1000)}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(codexPrompt);
  });
}

async function tryGenerateWithCodex(prompt: string, quality: ImageModel): Promise<AttachmentBuilder | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-codex-image-"));
  const outputFile = path.join(tmpDir, "toro-art.png");
  try {
    await runCodexForImage(prompt, quality, tmpDir, outputFile);
    const buffer = fs.readFileSync(outputFile);
    if (buffer.length === 0) return null;
    return new AttachmentBuilder(buffer, { name: "toro-art.png" });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}


function escapeSvg(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, max = 28): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= 5) break;
  }
  if (current && lines.length < 6) lines.push(current);
  return lines.length ? lines : ["TORO draw"];
}

function generateLocalFallback(prompt: string, quality: ImageModel): AttachmentBuilder {
  const title = quality === "pro" ? "TORO high fallback" : "TORO fast fallback";
  const lines = wrapText(prompt).map((line, i) => `<text x="64" y="${250 + i * 54}" class="prompt">${escapeSvg(line)}</text>`).join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d2b64"/>
      <stop offset="0.52" stop-color="#6c5ce7"/>
      <stop offset="1" stop-color="#f8cdda"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      .title { font: 700 56px system-ui, -apple-system, BlinkMacSystemFont, sans-serif; fill: white; }
      .small { font: 500 25px system-ui, -apple-system, BlinkMacSystemFont, sans-serif; fill: rgba(255,255,255,.78); }
      .prompt { font: 700 44px system-ui, -apple-system, BlinkMacSystemFont, sans-serif; fill: white; }
    </style>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="780" cy="190" r="150" fill="rgba(255,255,255,.18)" filter="url(#glow)"/>
  <circle cx="160" cy="820" r="220" fill="rgba(0,0,0,.16)"/>
  <rect x="48" y="160" width="928" height="560" rx="44" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.25)"/>
  <text x="64" y="110" class="title">${escapeSvg(title)}</text>
  <text x="64" y="775" class="small">Codex/OpenAI image generation was unavailable, so TORO made a local fallback card.</text>
  ${lines}
</svg>`;
  return new AttachmentBuilder(Buffer.from(svg, "utf-8"), { name: "toro-art-fallback.svg" });
}

async function tryGenerateWithOpenAI(prompt: string, quality: ImageModel): Promise<AttachmentBuilder | null> {
  if (!process.env.OPENAI_API_KEY) return null;

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
  return new AttachmentBuilder(buffer, { name: "toro-art.png" });
}

export async function generateImage(
  prompt: string,
  quality: ImageModel = "flash"
): Promise<{ attachment: AttachmentBuilder; usedModel: ImageModel; provider: ImageProvider } | null> {
  try {
    const attachment = await tryGenerateWithCodex(prompt, quality);
    if (attachment) return { attachment, usedModel: quality, provider: "codex" };
  } catch (err) {
    const msg = (err as Error).message || "";
    console.warn(`[Image] Codex generation failed, OpenAI API fallback if configured: ${msg.slice(0, 160)}`);
    const fallback = await tryGenerateWithOpenAI(prompt, quality);
    if (fallback) return { attachment: fallback, usedModel: quality, provider: "openai" };
    return { attachment: generateLocalFallback(prompt, quality), usedModel: quality, provider: "local" };
  }

  const fallback = await tryGenerateWithOpenAI(prompt, quality);
  if (fallback) return { attachment: fallback, usedModel: quality, provider: "openai" };
  return { attachment: generateLocalFallback(prompt, quality), usedModel: quality, provider: "local" };
}
