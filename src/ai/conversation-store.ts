import { prisma } from "../db/client";
import type { HistoryMessage } from "../bot/history";

export interface ConversationKey {
  teamId: string;
  guildId?: string | null;
  channelId: string;
}

export interface AppendConversationMessageInput extends ConversationKey {
  role: "user" | "assistant";
  content: string;
  discordUserId?: string | null;
  displayName?: string | null;
  discordMessageId?: string | null;
}

function normalizeGuildId(guildId?: string | null): string {
  return guildId ?? "__dm__";
}

async function getOrCreateConversation(key: ConversationKey) {
  const guildId = normalizeGuildId(key.guildId);
  return prisma.conversation.upsert({
    where: {
      teamId_guildId_channelId: {
        teamId: key.teamId,
        guildId,
        channelId: key.channelId,
      },
    },
    create: {
      teamId: key.teamId,
      guildId,
      channelId: key.channelId,
    },
    update: {},
  });
}

export async function appendConversationMessage(input: AppendConversationMessageInput) {
  const conversation = await getOrCreateConversation(input);
  return prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: input.role,
      content: input.content,
      discordUserId: input.discordUserId ?? null,
      displayName: input.displayName ?? null,
      discordMessageId: input.discordMessageId ?? null,
    },
  });
}

export async function getRecentConversationHistory(key: ConversationKey & { limit?: number }): Promise<HistoryMessage[]> {
  const guildId = normalizeGuildId(key.guildId);
  const conversation = await prisma.conversation.findUnique({
    where: {
      teamId_guildId_channelId: {
        teamId: key.teamId,
        guildId,
        channelId: key.channelId,
      },
    },
  });

  if (!conversation) return [];

  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: key.limit ?? 30,
  });

  return rows
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}
