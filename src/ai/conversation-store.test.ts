import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    conversation: { upsert: vi.fn(), findUnique: vi.fn() },
    conversationMessage: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "../db/client";
import { appendConversationMessage, getRecentConversationHistory } from "./conversation-store";

describe("conversation-store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses team + guild + channel as the conversation key", async () => {
    vi.mocked(prisma.conversation.upsert).mockResolvedValue({ id: "conv_1" } as never);
    vi.mocked(prisma.conversationMessage.create).mockResolvedValue({ id: "msg_1" } as never);

    await appendConversationMessage({ teamId: "team_1", guildId: "guild_1", channelId: "ch_1", role: "user", content: "hi", discordUserId: "user_1", displayName: "User", discordMessageId: "discord_1" });

    expect(prisma.conversation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { teamId_guildId_channelId: { teamId: "team_1", guildId: "guild_1", channelId: "ch_1" } },
    }));
    expect(prisma.conversationMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conversationId: "conv_1", role: "user", content: "hi" }) });
  });

  it("returns recent messages oldest-first for getReply", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: "conv_1" } as never);
    vi.mocked(prisma.conversationMessage.findMany).mockResolvedValue([
      { role: "assistant", content: "two" },
      { role: "user", content: "one" },
    ] as never);

    await expect(getRecentConversationHistory({ teamId: "team_1", guildId: "guild_1", channelId: "ch_1", limit: 2 })).resolves.toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
    ]);
  });
});
