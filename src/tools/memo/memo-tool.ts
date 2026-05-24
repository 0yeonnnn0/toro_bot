import { createMemo, searchMemos } from "./memo-store";

export async function handleMemoCreate(input: {
  teamId: string;
  authorDiscordUserId: string;
  content: string;
  mentions?: string[];
  source?: { guildId?: string | null; channelId?: string | null; messageId?: string | null };
}): Promise<string> {
  const subjectDiscordUserId = input.mentions?.[0] ?? null;
  await createMemo({
    teamId: input.teamId,
    authorDiscordUserId: input.authorDiscordUserId,
    subjectDiscordUserId,
    content: input.content,
    sourceGuildId: input.source?.guildId ?? null,
    sourceChannelId: input.source?.channelId ?? null,
    sourceMessageId: input.source?.messageId ?? null,
  });
  return subjectDiscordUserId
    ? `메모해뒀다냥. <@${subjectDiscordUserId}> 관련 메모로 저장했다냥.`
    : "메모해뒀다냥.";
}

export async function handleMemoSearch(input: { teamId: string; query?: string; mentions?: string[]; subjectDiscordUserId?: string | null }): Promise<string> {
  const subjectDiscordUserId = input.subjectDiscordUserId ?? input.mentions?.[0] ?? null;
  const memos = await searchMemos({ teamId: input.teamId, query: input.query, subjectDiscordUserId });
  if (memos.length === 0) return "관련 메모를 못 찾았다냥.";
  const lines = memos.map((memo, index) => `${index + 1}. ${memo.content}`);
  return `최근 메모다냥:\n${lines.join("\n")}`;
}
