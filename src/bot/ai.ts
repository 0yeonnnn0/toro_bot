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

export async function getReply(history: HistoryMessage[], ragContext: string = "", userId: string = ""): Promise<string> {
  const basePrompt = buildPromptWithCustom(userId);
  const parts = [`<persona>\n${basePrompt}\n</persona>`];
  if (ragContext) parts.push(`<memory>\n${ragContext}\n</memory>`);
  parts.push(`<task>\n위 대화에 자연스럽게 답변해. persona의 성격과 말투를 반드시 유지해.\n</task>`);
  return callAI(history, parts.join("\n\n"));
}

export const DEFAULT_JUDGE_PROMPT = `너는 디스코드 채팅방을 지켜보는 봇이야.
아래 대화를 보고, 네가 자연스럽게 끼어들 수 있는 상황이면 답변해.
끼어드는 게 어색하거나 굳이 필요 없으면 정확히 "<SKIP>"이라고만 답해.

중요: 기본값은 "<SKIP>"이야. 확실히 끼어들 만한 이유가 있을 때만 답변해. 애매하면 SKIP해.

<rules>
끼어들면 좋은 상황:
- 누가 너에 대해 직접 이야기하거나 의견을 물을 때
- 네가 확실히 재밌는 드립을 칠 수 있을 때
- 질문이 공중에 떠 있고 아무도 안 답할 때
- 대화가 한참 멈춰서 분위기가 심심할 때
- 누가 링크를 공유했는데 아무도 반응이 없을 때
- 이미지가 첨부되었는데 재밌거나 반응할 만할 때

끼어들지 말아야 할 상황:
- 두 사람이 대화를 주고받는 중이면 절대 끼어들지 마 (티키타카 중엔 SKIP)
- 대화가 잘 흘러가고 있으면 굳이 끼어들 필요 없어
- 맥락을 잘 모르는 대화일 때
- 방금 네가 이미 말한 직후일 때
- 상대방이 아직 말을 끝내지 않은 것 같을 때
- "ㅋㅋ", "ㅇㅇ", "ㄹㅇ", "ㅇㅈ" 같은 짧은 리액션만 있을 때
- 누군가의 말에 다른 사람이 이미 잘 대답했을 때
</rules>

<examples>
<example>
<conversation>A: 오늘 치킨 먹을까 / B: 오 좋아 뭐 시키지</conversation>
<reasoning>두 사람이 티키타카 중</reasoning>
<decision><SKIP></decision>
</example>
<example>
<conversation>A: 이 버그 어떻게 고치지...</conversation>
<reasoning>질문이 허공에 떠 있고 아무도 안 답함</reasoning>
<decision>답변</decision>
</example>
<example>
<conversation>A: ㅋㅋㅋㅋ / B: ㄹㅇ</conversation>
<reasoning>짧은 리액션만 오감</reasoning>
<decision><SKIP></decision>
</example>
<example>
<conversation>A: 토로 요즘 뭐해?</conversation>
<reasoning>봇에 대한 직접 언급</reasoning>
<decision>답변</decision>
</example>
<example>
<conversation>A: 나 시험 망했어 / B: 에이 괜찮아 / A: ㅠㅠ 고마워</conversation>
<reasoning>B가 이미 잘 위로해줬고 대화가 마무리되는 중</reasoning>
<decision><SKIP></decision>
</example>
</examples>`;

function getJudgePrompt(): string {
  return state.config.judgePrompt || DEFAULT_JUDGE_PROMPT;
}

export async function judgeAndReply(history: HistoryMessage[], ragContext: string = "", userId: string = ""): Promise<string | null> {
  const basePrompt = buildPromptWithCustom(userId);
  const parts = [`<persona>\n${basePrompt}\n</persona>`];
  if (ragContext) parts.push(`<memory>\n${ragContext}\n</memory>`);
  parts.push(`<task>\n${getJudgePrompt()}\n</task>`);
  const reply = await callAI(history, parts.join("\n\n"));
  if (reply.trim() === "<SKIP>") return null;
  return reply;
}

export async function callAI(history: HistoryMessage[], prompt: string): Promise<string> {
  const provider = state.config.aiProvider;
  const model = state.config.model;
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
