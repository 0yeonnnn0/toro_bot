import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { buildPromptWithCustom } from "./prompt";
import { state } from "../shared/state";
import { addEvent } from "../shared/state";
import { defaultModelForProvider, fallbackModel, DEFAULT_GEMINI_FALLBACK_PROVIDER } from "../shared/ai-defaults";
import type { HistoryMessage } from "./history";

// Tracks which model was actually used in the last callAI invocation
export let lastUsedModel = "";

async function callProvider(provider: string, model: string, history: HistoryMessage[], prompt: string): Promise<string> {
  switch (provider) {
    case "codex":
      return await getCodexReply(history, prompt, model);
    case "anthropic":
      return await getAnthropicReply(history, prompt, model);
    case "openai":
      return await getOpenAIReply(history, prompt, model);
    case "google":
      return await getGoogleReply(history, prompt, model);
    default:
      throw new Error(`지원하지 않는 AI_PROVIDER: ${provider}`);
  }
}

export async function getReply(history: HistoryMessage[], requestContext: string = "", userId: string = ""): Promise<string> {
  const basePrompt = buildPromptWithCustom(userId);
  const parts = [`<persona>\n${basePrompt}\n</persona>`];
  if (requestContext) parts.push(`<request_context>\n${requestContext}\n</request_context>`);
  parts.push(`<task>\n위 대화에 자연스럽게 답변해. persona의 성격과 말투를 반드시 유지해.\n</task>`);
  return callAI(history, parts.join("\n\n"));
}

function hasImageInput(history: HistoryMessage[]): boolean {
  return history.some((msg) => Boolean(msg.imageData));
}

function hasGoogleApiKey(): boolean {
  return Boolean(state.config.googleApiKey || process.env.GOOGLE_API_KEY);
}

export async function callAI(history: HistoryMessage[], prompt: string): Promise<string> {
  let provider = state.config.aiProvider;
  let model = state.config.model;

  // Codex CLI currently only receives text. If a Discord message contains an
  // image and Google vision is configured, route that single request to Gemini
  // vision instead of silently reducing the image to "[이미지 첨부]".
  if (hasImageInput(history) && provider === "codex" && hasGoogleApiKey()) {
    provider = "google";
    model = fallbackModel();
  }

  lastUsedModel = model;

  try {
    return await callProvider(provider, model, history, prompt);
  } catch (err) {
    const msg = (err as Error).message || "";
    const normalized = msg.toLowerCase();
    const isRetryable = normalized.includes("429") || normalized.includes("quota") || normalized.includes("limit") || normalized.includes("500") || normalized.includes("503") || normalized.includes("overloaded") || normalized.includes("not found") || normalized.includes("does not exist") || normalized.includes("model") || normalized.includes("timed out") || normalized.includes("enoent") || normalized.includes("codex");
    const fallback = fallbackModel();

    if (!isRetryable || (provider === DEFAULT_GEMINI_FALLBACK_PROVIDER && model === fallback)) throw err;

    console.warn(`[AI Fallback] ${provider}/${model} 실패 (${msg.slice(0, 80)}), ${DEFAULT_GEMINI_FALLBACK_PROVIDER}/${fallback}로 재시도`);
    addEvent("ai_fallback", `${provider}/${model} → ${DEFAULT_GEMINI_FALLBACK_PROVIDER}/${fallback}`);

    lastUsedModel = fallback;
    return await callProvider(DEFAULT_GEMINI_FALLBACK_PROVIDER, fallback, history, prompt);
  }
}

async function getCodexReply(history: HistoryMessage[], prompt: string, model: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-codex-"));
  const outputFile = path.join(tmpDir, "answer.txt");
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--cd",
    process.env.CODEX_WORKDIR || os.tmpdir(),
    "--output-last-message",
    outputFile,
  ];
  if (model && model !== "codex-cli-default") args.push("--model", model);
  args.push("-");

  const conversation = history.map((msg) => `${msg.role === "assistant" ? "TORO" : "User"}: ${msg.content}`).join("\n");
  const codexPrompt = [
    "You are TORO, a Discord chat bot. Use the persona/system instructions below and answer the latest conversation naturally.",
    "Do not modify files. Do not run commands unless absolutely necessary. Return only the final chat reply text.",
    "",
    "<system_instructions>",
    prompt,
    "</system_instructions>",
    "",
    "<conversation>",
    conversation,
    "</conversation>",
  ].join("\n");

  try {
    await runCodex(args, codexPrompt);
    const reply = fs.readFileSync(outputFile, "utf-8").trim();
    if (!reply) throw new Error("Codex returned an empty reply");
    return reply;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runCodex(args: string[], input: string): Promise<void> {
  const timeoutMs = Number(process.env.CODEX_TIMEOUT_MS || 180000);
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CODEX_BIN || "codex", args, {
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Codex exited with ${code}: ${(stderr || stdout).slice(-1000)}`));
    });
    child.stdin.end(input);
  });
}

async function getAnthropicReply(history: HistoryMessage[], prompt: string, model: string): Promise<string> {
  const apiKey = state.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API 키가 설정되지 않았습니다. Settings → API Keys에서 설정하세요.");
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: model || defaultModelForProvider("anthropic"),
    max_tokens: 512,
    system: prompt,
    messages: history,
  });
  return response.content[0].text;
}

async function getOpenAIReply(history: HistoryMessage[], prompt: string, model: string): Promise<string> {
  const apiKey = state.config.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다. Settings → API Keys에서 설정하세요.");
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey });
  const messages = [
    { role: "system" as const, content: prompt },
    ...history,
  ];
  const response = await client.chat.completions.create({
    model: model || defaultModelForProvider("openai"),
    max_tokens: 512,
    messages,
  });
  return response.choices[0].message.content;
}

async function getGoogleReply(history: HistoryMessage[], prompt: string, model: string): Promise<string> {
  const apiKey = state.config.googleApiKey || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Google API 키가 설정되지 않았습니다. Settings → API Keys에서 설정하세요.");
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const isGemma = (model || "").startsWith("gemma");

  // Gemma doesn't support systemInstruction, inject prompt as first user message instead
  const m = genAI.getGenerativeModel({
    model: model || defaultModelForProvider("google"),
    ...(isGemma ? {} : { systemInstruction: prompt }),
  });

  const contents = [
    ...(isGemma ? [{ role: "user" as const, parts: [{ text: `[시스템 지시]\n${prompt}\n\n위 지시를 따라서 아래 대화에 응답해.` }] }, { role: "model" as const, parts: [{ text: "알겠어." }] }] : []),
    ...history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [
        { text: msg.content },
        ...(msg.imageData ? [{ inlineData: { mimeType: msg.imageData.mimeType, data: msg.imageData.data } }] : []),
      ],
    })),
  ];

  const result = await m.generateContent({ contents });
  return result.response.text();
}

console.log(`AI: ${state.config.aiProvider} / ${state.config.model}`);
