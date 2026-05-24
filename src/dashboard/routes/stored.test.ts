import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/client", () => ({
  prisma: {
    memo: { findMany: vi.fn(async () => [{ id: "memo_1", content: "저장된 메모", createdAt: new Date("2026-01-01T00:00:00Z"), authorDiscordUserId: "user_1", subjectDiscordUserId: null, team: { name: "Alpha", slug: "alpha" } }]) },
    conversation: { findMany: vi.fn(async () => [{ id: "conv_1", guildId: "guild_1", channelId: "channel_1", updatedAt: new Date("2026-01-02T00:00:00Z"), team: { name: "Alpha", slug: "alpha" }, messages: [{ id: "msg_1", role: "user", content: "안녕", displayName: "Tester", createdAt: new Date("2026-01-02T00:00:00Z") }] }]) },
  },
}));

import { listStoredMemos, listStoredConversations } from "./stored";

describe("stored dashboard data", () => {
  it("lists saved memos with team information", async () => {
    await expect(listStoredMemos()).resolves.toMatchObject([{ id: "memo_1", content: "저장된 메모", team: { name: "Alpha" } }]);
  });

  it("lists conversations with recent messages", async () => {
    await expect(listStoredConversations()).resolves.toMatchObject([{ id: "conv_1", messages: [{ content: "안녕" }] }]);
  });
});
