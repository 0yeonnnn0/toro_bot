import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/client", () => ({
  prisma: { memo: { create: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from "../../db/client";
import { createMemo, searchMemos } from "./memo-store";
import { handleMemoCreate, handleMemoSearch } from "./memo-tool";

describe("memo tool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores memo with team and source metadata", async () => {
    vi.mocked(prisma.memo.create).mockResolvedValue({ id: "memo_1" } as never);
    await createMemo({ teamId: "team_1", authorDiscordUserId: "user_1", content: "철수가 100만원", subjectDiscordUserId: "user_2", sourceGuildId: "guild_1", sourceChannelId: "ch_1", sourceMessageId: "msg_1", tags: ["돈"] });
    expect(prisma.memo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ teamId: "team_1", subjectDiscordUserId: "user_2", tags: JSON.stringify(["돈"]) }) });
  });

  it("searches memos by team, keyword, and subject", async () => {
    vi.mocked(prisma.memo.findMany).mockResolvedValue([] as never);
    await searchMemos({ teamId: "team_1", query: "100만원", subjectDiscordUserId: "user_2" });
    expect(prisma.memo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teamId: "team_1", subjectDiscordUserId: "user_2" }) }));
  });

  it("returns Korean confirmation for memo create", async () => {
    vi.mocked(prisma.memo.create).mockResolvedValue({ id: "memo_1" } as never);
    await expect(handleMemoCreate({ teamId: "team_1", authorDiscordUserId: "user_1", content: "메모 내용", mentions: ["user_2"] })).resolves.toContain("메모해뒀다냥");
  });

  it("formats empty search result", async () => {
    vi.mocked(prisma.memo.findMany).mockResolvedValue([] as never);
    await expect(handleMemoSearch({ teamId: "team_1", query: "없음", mentions: [] })).resolves.toContain("못 찾았다냥");
  });
});
