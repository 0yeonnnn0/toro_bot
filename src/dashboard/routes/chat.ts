import { Router, Request, Response } from "express";
import { getPresets, getPreset } from "../../bot/prompt";
import { getReply, callAI, lastUsedModel } from "../../bot/ai";
import { state } from "../../shared/state";
import { addChatLog } from "../chat-logs";

const router = Router();

// ── Public Chat API (no auth required) ──
router.get("/chat/characters", (_req: Request, res: Response) => {
  const all = getPresets(true); // enabled only
  const characters = all.map(p => ({ id: p.id, name: p.name, description: p.description }));
  res.json(characters);
});

router.post("/chat/send", async (req: Request, res: Response) => {
  const { characterId, message, sessionId, nickname, history } = req.body;
  if (!characterId || !message || !sessionId) {
    return res.status(400).json({ error: "characterId, message, sessionId가 필요합니다" });
  }

  try {
    const preset = getPreset(characterId);
    if (!preset) return res.status(404).json({ error: "캐릭터를 찾을 수 없습니다" });

    const chatHistory = (history || []).slice(-10).map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    const userContent = state.config.webShowNickname ? `${nickname || "익명"}: ${message}` : message;
    chatHistory.push({ role: "user" as const, content: userContent });

    let prompt = preset.prompt + (preset.userSuffix || "");
    if (state.config.webSystemPrompt) prompt += "\n\n" + state.config.webSystemPrompt;
    const reply = await callAI(chatHistory, prompt);

    // Log the chat
    addChatLog({
      sessionId,
      characterId,
      characterName: preset.name,
      nickname: nickname || "익명",
      userMessage: message,
      botReply: reply,
      model: lastUsedModel,
    });

    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Test reply
router.post("/test-reply", async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message가 필요합니다" });
  try {
    const h = [{ role: "user" as const, content: `테스터: ${message}` }];
    const reply = await getReply(h, "", process.env.OWNER_ID || "");
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
