import { Router, Request, Response } from "express";
import { client } from "../../bot/client";
import { state, saveState } from "../../shared/state";
import { getQueueStats } from "../../bot/queue";
import { DEFAULT_JUDGE_PROMPT } from "../../bot/ai";
import { maskKey } from "../../shared/keys";

const router = Router();

function safeConfig() {
  const { googleApiKey, openaiApiKey, anthropicApiKey, dashboardSecret, ...safe } = state.config;
  return safe;
}

router.get("/status", (_req: Request, res: Response) => {
  res.json({
    online: client.isReady(),
    uptime: Date.now() - state.stats.startedAt,
    guilds: client.guilds?.cache.size || 0,
    stats: state.stats,
    queue: getQueueStats(),
    config: safeConfig(),
  });
});

router.get("/config", (_req: Request, res: Response) => res.json({ ...safeConfig(), defaultJudgePrompt: DEFAULT_JUDGE_PROMPT }));

router.put("/config", (req: Request, res: Response) => {
  const { aiProvider, model, replyMode, judgeInterval, judgeThreshold } = req.body;
  if (aiProvider !== undefined) {
    if (!["codex", "google", "openai", "anthropic"].includes(aiProvider)) {
      return res.status(400).json({ error: "잘못된 aiProvider" });
    }
    state.config.aiProvider = aiProvider;
  }
  if (model !== undefined) state.config.model = model;
  if (replyMode !== undefined) {
    if (!["auto", "interval", "mute"].includes(replyMode)) {
      return res.status(400).json({ error: "replyMode는 auto, interval, mute 중 하나" });
    }
    state.config.replyMode = replyMode;
  }
  if (judgeInterval !== undefined) {
    const v = parseInt(judgeInterval);
    if (isNaN(v) || v < 10 || v > 600) return res.status(400).json({ error: "judgeInterval은 10~600초" });
    state.config.judgeInterval = v;
  }
  if (judgeThreshold !== undefined) {
    const v = parseInt(judgeThreshold);
    if (isNaN(v) || v < 1 || v > 50) return res.status(400).json({ error: "judgeThreshold는 1~50" });
    state.config.judgeThreshold = v;
  }
  if (req.body.judgePrompt !== undefined) {
    state.config.judgePrompt = req.body.judgePrompt;
  }
  if (req.body.webShowNickname !== undefined) {
    state.config.webShowNickname = !!req.body.webShowNickname;
  }
  if (req.body.webSystemPrompt !== undefined) {
    state.config.webSystemPrompt = req.body.webSystemPrompt;
  }
  if (req.body.imageRecognition !== undefined) {
    state.config.imageRecognition = !!req.body.imageRecognition;
  }
  if (req.body.passiveLogging !== undefined) {
    state.config.passiveLogging = !!req.body.passiveLogging;
  }
  res.json(safeConfig());
});

router.get("/keys", (_req: Request, res: Response) => {
  res.json({
    googleApiKey: maskKey(state.config.googleApiKey || process.env.GOOGLE_API_KEY),
    openaiApiKey: maskKey(state.config.openaiApiKey || process.env.OPENAI_API_KEY),
    anthropicApiKey: maskKey(state.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    dashboardSecret: maskKey(state.config.dashboardSecret || process.env.DASHBOARD_SECRET),
  });
});

router.put("/keys", (req: Request, res: Response) => {
  const { googleApiKey, openaiApiKey, anthropicApiKey, dashboardSecret } = req.body;
  if (googleApiKey !== undefined && googleApiKey !== "") state.config.googleApiKey = googleApiKey;
  if (openaiApiKey !== undefined && openaiApiKey !== "") state.config.openaiApiKey = openaiApiKey;
  if (anthropicApiKey !== undefined && anthropicApiKey !== "") state.config.anthropicApiKey = anthropicApiKey;
  if (dashboardSecret !== undefined && dashboardSecret !== "") state.config.dashboardSecret = dashboardSecret;
  saveState();
  res.json({ ok: true });
});

router.post("/keys/test", async (req: Request, res: Response) => {
  const { provider } = req.body;
  try {
    if (provider === "codex") {
      const { execFile } = require("child_process");
      execFile(process.env.CODEX_BIN || "codex", ["--version"], { timeout: 5000 }, (err: Error | null) => {
        if (err) return res.json({ ok: false, error: "Codex CLI를 실행할 수 없음: " + err.message.slice(0, 80) });
        return res.json({ ok: true });
      });
    } else if (provider === "google") {
      const key = state.config.googleApiKey || process.env.GOOGLE_API_KEY;
      if (!key) return res.json({ ok: false, error: "Google API 키가 설정되지 않음" });
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(key);
      const m = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      await m.generateContent({ contents: [{ role: "user", parts: [{ text: "ping" }] }] });
      res.json({ ok: true });
    } else if (provider === "openai") {
      const key = state.config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!key) return res.json({ ok: false, error: "OpenAI API 키가 설정되지 않음" });
      const OpenAI = require("openai");
      const client = new OpenAI({ apiKey: key });
      await client.models.list();
      res.json({ ok: true });
    } else if (provider === "anthropic") {
      const key = state.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) return res.json({ ok: false, error: "Anthropic API 키가 설정되지 않음" });
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: key });
      await client.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
      res.json({ ok: true });
    } else {
      res.status(400).json({ ok: false, error: "잘못된 provider" });
    }
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message?.slice(0, 100) || "검증 실패" });
  }
});

router.get("/events", (_req: Request, res: Response) => res.json(state.events.slice().reverse()));
router.get("/errors", (_req: Request, res: Response) => res.json(state.errors.slice().reverse()));

export default router;
