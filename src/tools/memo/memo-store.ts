import { prisma } from "../../db/client";

export interface CreateMemoInput {
  teamId: string;
  authorDiscordUserId: string;
  content: string;
  subjectDiscordUserId?: string | null;
  tags?: string[];
  sourceGuildId?: string | null;
  sourceChannelId?: string | null;
  sourceMessageId?: string | null;
}

export async function createMemo(input: CreateMemoInput) {
  return prisma.memo.create({
    data: {
      teamId: input.teamId,
      authorDiscordUserId: input.authorDiscordUserId,
      subjectDiscordUserId: input.subjectDiscordUserId ?? null,
      content: input.content,
      tags: JSON.stringify(input.tags ?? []),
      sourceGuildId: input.sourceGuildId ?? null,
      sourceChannelId: input.sourceChannelId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
    },
  });
}

export interface SearchMemosInput {
  teamId: string;
  query?: string;
  subjectDiscordUserId?: string | null;
  limit?: number;
}

export async function searchMemos(input: SearchMemosInput) {
  return prisma.memo.findMany({
    where: {
      teamId: input.teamId,
      ...(input.subjectDiscordUserId ? { subjectDiscordUserId: input.subjectDiscordUserId } : {}),
      ...(input.query ? { content: { contains: input.query } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 5,
  });
}
