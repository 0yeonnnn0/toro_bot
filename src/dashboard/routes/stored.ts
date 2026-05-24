import { Router } from "express";
import { prisma } from "../../db/client";

const router = Router();

function clampLimit(raw: unknown, fallback = 50, max = 200): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function listStoredMemos(limit = 50) {
  const memos = await prisma.memo.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { team: { select: { name: true, slug: true } } },
  });
  return memos.map((memo) => ({
    id: memo.id,
    team: memo.team,
    authorDiscordUserId: memo.authorDiscordUserId,
    subjectDiscordUserId: memo.subjectDiscordUserId,
    content: memo.content,
    sourceGuildId: memo.sourceGuildId,
    sourceChannelId: memo.sourceChannelId,
    sourceMessageId: memo.sourceMessageId,
    createdAt: memo.createdAt.toISOString(),
    updatedAt: memo.updatedAt?.toISOString?.() ?? memo.createdAt.toISOString(),
  }));
}

export async function listStoredConversations(limit = 30) {
  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      team: { select: { name: true, slug: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
  return conversations.map((conversation) => ({
    id: conversation.id,
    team: conversation.team,
    guildId: conversation.guildId,
    channelId: conversation.channelId,
    updatedAt: conversation.updatedAt.toISOString(),
    messages: conversation.messages.slice().reverse().map((message) => ({
      id: message.id,
      role: message.role,
      displayName: message.displayName,
      discordUserId: message.discordUserId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  }));
}

router.get("/stored/memos", async (req, res) => {
  res.json(await listStoredMemos(clampLimit(req.query.limit)));
});

router.get("/stored/conversations", async (req, res) => {
  res.json(await listStoredConversations(clampLimit(req.query.limit, 30, 100)));
});

export default router;
