import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import OpenAI from "openai";
import { AttachmentBuilder } from "discord.js";
import { state } from "../shared/state";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  }
  return openai;
}

export type ImageModel = "flash" | "pro";
export type ImageProvider = "codex" | "openai" | "google";

const IMAGE_REQUEST_RE = /(그림|이미지|일러스트|사진|짤|캐릭터|프로필|배경화면|포스터|로고).*(그려|그리|만들|생성|뽑|제작|draw|generate|create)|(그려줘|그려 줄래|draw me|make me an image|generate an image)/i;
const VECTOR_OR_CODE_RE = /(svg|벡터|vector|html|코드|마크업|다이어그램|diagram|mermaid|ascii|아스키)/i;

export function isImageGenerationRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (VECTOR_OR_CODE_RE.test(normalized)) return false;
  return IMAGE_REQUEST_RE.test(normalized);
}

export function extractImagePrompt(text: string): string {
  return text
    .replace(/<@!?\d+>/g, " ")
    .replace(/^(토로야|토로|toro)[,\s:]*/i, "")
    .replace(/(그림|이미지|일러스트|사진|짤)\s*(좀|하나|한 장)?\s*(그려줘|그려|만들어줘|만들어|생성해줘|생성해|뽑아줘|제작해줘)/gi, "")
    .replace(/(그려줘|만들어줘|생성해줘|draw|generate|create)/gi, "")
    .replace(/\s+/g, " ")
    .trim() || text.trim();
}

function imageModelName(): string {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
}

function googleImageModelName(): string {
  return process.env.GOOGLE_IMAGE_MODEL || "gemini-2.5-flash-image-preview";
}

function googleApiKey(): string {
  return state.config.googleApiKey || process.env.GOOGLE_API_KEY || "";
}

function imageQuality(quality: ImageModel): "low" | "high" {
  return quality === "pro" ? "high" : "low";
}

let lastImageFailureSummary = "";

export function getLastImageFailureSummary(): string {
  return lastImageFailureSummary;
}

function summarizeError(err: unknown): string {
  return ((err as Error).message || String(err))
    .replace(/key=[^\s&]+/gi, "key=***")
    .replace(/x-access-token:[^@\s]+/gi, "x-access-token:***")
    .slice(0, 500);
}

function codexTimeoutMs(): number {
  return Number(process.env.CODEX_IMAGE_TIMEOUT_MS || process.env.CODEX_TIMEOUT_MS || 300000);
}

function buildCodexArgs(workdir: string): string[] {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--cd",
    workdir,
  ];

  if (process.env.CODEX_HOME) {
    args.push("--add-dir", process.env.CODEX_HOME);
  }

  args.push("-");
  return args;
}

function codexSpawnCommand(args: string[]): { command: string; args: string[] } {
  if (process.env.CODEX_BIN) return { command: process.env.CODEX_BIN, args };
  if (process.env.CODEX_USE_NPX === "1") return { command: "npx", args: ["-y", "@openai/codex", ...args] };
  return { command: "codex", args };
}

function runCodexForImage(prompt: string, quality: ImageModel, workdir: string, outputFile: string): Promise<void> {
  const args = buildCodexArgs(workdir);

  const codexPrompt = [
    "You are TORO's image generation worker.",
    "Use Codex CLI's built-in image generation capability for this request. Explicitly invoke the $imagegen skill/tool if it is available.",
    "Create an original raster bitmap image for this Discord /draw request. Do not satisfy this request with SVG, HTML, canvas code, Markdown, or a text description.",
    "Do not ask follow-up questions. Do not require an OpenAI API key. Do not call Gemini.",
    `Save or copy the final generated image as a PNG file at exactly: ${outputFile}`,
    "The file must be a real PNG image attachment with PNG bytes, not an SVG/XML/text file renamed to .png.",
    "If the built-in image tool saves under $CODEX_HOME/generated_images or another default location, copy the selected generated PNG to the exact output path above before finishing.",
    `Quality preset: ${quality === "pro" ? "high detail" : "fast draft"}`,
    "",
    "Prompt:",
    prompt,
  ].join("\n");

  return new Promise((resolve, reject) => {
    const launch = (command: string, launchArgs: string[], retriedWithNpx = false) => {
      const child = spawn(command, launchArgs, {
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
      child.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (!process.env.CODEX_BIN && !retriedWithNpx && err.code === "ENOENT") {
          launch("npx", ["-y", "@openai/codex", ...args], true);
          return;
        }
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Codex image generation failed (${code}): ${(stderr || stdout).slice(-2000)}`));
      });
      child.stdin.on("error", () => {});
      child.stdin.end(codexPrompt);
    };

    const initial = codexSpawnCommand(args);
    launch(initial.command, initial.args);
  });
}

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a;
}

function newestGeneratedCodexPng(sinceMs: number): Buffer | null {
  const codexHome = process.env.CODEX_HOME;
  if (!codexHome) return null;

  const root = path.join(codexHome, "generated_images");
  if (!fs.existsSync(root)) return null;

  let newestPath: string | null = null;
  let newestMtimeMs = -Infinity;
  const visit = (dir: string, depth = 0) => {
    if (depth > 5) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs + 5000 < sinceMs) continue;
        if (stat.mtimeMs > newestMtimeMs) {
          newestPath = fullPath;
          newestMtimeMs = stat.mtimeMs;
        }
      } catch {}
    }
  };

  visit(root);
  if (!newestPath) return null;

  const buffer = fs.readFileSync(newestPath);
  return isPngBuffer(buffer) ? buffer : null;
}

async function tryGenerateWithCodex(prompt: string, quality: ImageModel): Promise<AttachmentBuilder | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-codex-image-"));
  const outputFile = path.join(tmpDir, "toro-art.png");
  const startedAt = Date.now();
  try {
    await runCodexForImage(prompt, quality, tmpDir, outputFile);
    let buffer: Buffer | null = null;

    if (fs.existsSync(outputFile)) {
      const direct = fs.readFileSync(outputFile);
      if (isPngBuffer(direct)) buffer = direct;
    }

    // Codex's built-in image tool often writes to $CODEX_HOME/generated_images and
    // reports success before shell-copying into our temp dir. In that case, attach
    // the newest generated PNG directly instead of falling through to API-key providers.
    buffer ??= newestGeneratedCodexPng(startedAt);

    if (!buffer) {
      throw new Error("Codex finished but no valid PNG was found in the requested path or $CODEX_HOME/generated_images");
    }

    return new AttachmentBuilder(buffer, { name: "toro-art.png" });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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

async function tryGenerateWithGoogle(prompt: string, quality: ImageModel): Promise<AttachmentBuilder | null> {
  const key = googleApiKey();
  if (!key) return null;

  const model = googleImageModelName();
  const qualityHint = quality === "pro" ? "high detail, polished composition" : "fast draft, clear composition";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\nCreate one original image. Style/quality: ${qualityHint}.` }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google image generation failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = await response.json() as any;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
  const inline = imagePart?.inlineData ?? imagePart?.inline_data;
  if (!inline?.data) return null;

  const mimeType = inline.mimeType || inline.mime_type || "image/png";
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const buffer = Buffer.from(inline.data, "base64");
  if (buffer.length === 0) return null;
  return new AttachmentBuilder(buffer, { name: `toro-art.${ext}` });
}

export async function generateImage(
  prompt: string,
  quality: ImageModel = "flash"
): Promise<{ attachment: AttachmentBuilder; usedModel: ImageModel; provider: ImageProvider } | null> {
  const failures: string[] = [];
  lastImageFailureSummary = "";

  try {
    const attachment = await tryGenerateWithCodex(prompt, quality);
    if (attachment) return { attachment, usedModel: quality, provider: "codex" };
  } catch (err) {
    const msg = summarizeError(err);
    failures.push(`Codex: ${msg}`);
    console.warn(`[Image] Codex generation failed, API fallback if configured: ${msg.slice(0, 160)}`);
  }

  try {
    const fallback = await tryGenerateWithOpenAI(prompt, quality);
    if (fallback) return { attachment: fallback, usedModel: quality, provider: "openai" };
    if (!process.env.OPENAI_API_KEY) failures.push("OpenAI: OPENAI_API_KEY 없음");
  } catch (err) {
    const msg = summarizeError(err);
    failures.push(`OpenAI: ${msg}`);
    console.warn(`[Image] OpenAI generation failed, Google fallback if configured: ${msg.slice(0, 160)}`);
  }

  try {
    const fallback = await tryGenerateWithGoogle(prompt, quality);
    if (fallback) return { attachment: fallback, usedModel: quality, provider: "google" };
    if (!googleApiKey()) failures.push("Google: GOOGLE_API_KEY 없음");
  } catch (err) {
    const msg = summarizeError(err);
    failures.push(`Google: ${msg}`);
    console.warn(`[Image] Google generation failed: ${msg.slice(0, 160)}`);
  }

  lastImageFailureSummary = failures.join(" / ");
  return null;
}
